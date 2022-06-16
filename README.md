# image-compress-lambda
Node.js AWS lambda handler for compressing and resizing images on the fly.

The aim of this project is to provide a lambda function which shrinks and compresses images on the fly, using S3 as
data repository.

[![nodejs](https://badges.aleen42.com/src/node.svg)](https://nodejs.org/)
[![types](https://badges.aleen42.com/src/typescript.svg)](https://www.typescriptlang.org/)
[![lint](https://badges.aleen42.com/src/eslint.svg)](https://eslint.org/)
[![code style: prettier](https://img.shields.io/badge/code_style-prettier-ff69b4.svg)](https://github.com/prettier/prettier)
[![License: GNU](https://img.shields.io/badge/License-GNU-blue.svg)](https://www.gnu.org/licenses/gpl-3.0.en.html)

## Deployment

1. Clone the repository.

```
$ git clone https://github.com/giwiro/image-compress-lambda.git
```

2. Install all dependencies.

```
$ npm install
```

3. Build the lambda code intro a zip file. This will generate a `build-zip` folder with a zip file in it.

```
$ npm run build
```

4. Upload the generated zip file along the cloudformation config file into an S3 bucket through a script in
   `scripts/sync.ts`. This bucket will host just these 2 files: the `provision/main.yaml` and the
   `lambda/image-compress-lambda.zip`, do not get confused with the bucket hosting the images. Also do not
   forget to pass the environment variables: `S3_BUCKET` and `S3_REGION`.

```
$ S3_BUCKET=image-compress-lambda S3_REGION=us-east-1 npm run sync
```

5. Deploy the uploaded `provision/main.yaml` into cloudformation and provide all required info. This will
   create the `image-compress-lambda` function and optionally (recommended) the `disable-cache-cloudfront-lambda`
   function.

![parameters](resources/cf-parameters.png?raw=true)

6. Configure the redirect rule for the S3 bucket hosting the images. (Check the **NOTE #2**)

7. Configure the `disable-cache-cloudfront-lambda` as Lambda@Edge for the cloudfront distribution.

## Stack

For the code itself we use `typescript` with `eslint` and `prettier` for code formatting. Additionally, we use
`swc` (a very fast web compiler) along with some custom `javascript` build and configure scripts.

In order to control the deployment we used `cloudformation` configure files and a `bash` script for synchronize
it with the S3 bucket.

## Architecture

![architecture](resources/image-compress-lambda-architecture.png?raw=true)

1. The HTTP request first lands on Cloudfront which will perform ssl termination and cache for the s3 objects.
   The format will be something like this: `<path>/<dimensions>/<filename>`.
   For example: `/public/path/200x200/picture_1618444089.jpg`.
   **(NOTE #1)**

3. Cloudfront later will perform a reverse proxy to the S3 object website url.

4. If the object is present in the bucket (404), then it is returned. Otherwise, it will redirect to the API Gateway.
   **(NOTE #2)** **(NOTE #3)**

5. The API Gateway will perform a call (invoke) to the aws lambda function.

6. If the original object exists (without the `<dimensions>` part), then it will shrink and lower the quality of the image
   to the required size. After that, the image get compressed with gzip algorithm through the zlib node.js library. Finally,
   the generated thumbnail is uploaded to the S3 bucket.

7. The lambda function returns a redirect (301) to the s3 thumbnail.

8. Finally, the API Gateway returns the redirect response to the Cloudfront endpoint, and the client request will be
   automatically redirected to the created resource.

## Notes

### NOTE 1

Pay attention to the request url to the s3 bucket hosting the images. It has a particular prefix `public`, but it does not have
to be this exact keyword. It can be any prefix you like, but you will need it later for the S3 bucket redirect rule. 

### NOTE 2

Do not forget to configure the S3 redirect rules when the object is absent (404). This rule will depend on the ApiGatewayStage
and the prefix of the request url to the s3 bucket hosting the images.

```json
[
  {
    "Condition": {
      "HttpErrorCodeReturnedEquals": "404",
      "KeyPrefixEquals": "<prefix>"
    },
    "Redirect": {
      "HostName": "<api_gateway_id>.execute-api.<region>.amazonaws.com",
      "HttpRedirectCode": "307",
      "Protocol": "https",
      "ReplaceKeyPrefixWith": "<stage>/<prefix>"
    }
  }
]
```

If the stage is "local" and the prefix is "public", then the rule would look like something like this:

```json
[
  {
    "Condition": {
      "HttpErrorCodeReturnedEquals": "404",
      "KeyPrefixEquals": "public"
    },
    "Redirect": {
      "HostName": "<api_gateway_id>.execute-api.<region>.amazonaws.com",
      "HttpRedirectCode": "307",
      "Protocol": "https",
      "ReplaceKeyPrefixWith": "local/public"
    }
  }
]
```

### NOTE 3

There might be a small (big) inconvenient that will cause an infinite loop.

In the step 3, after the object was not found and a redirection was returned to the client, cloudfront will cache this
redirection (keep this in mind).
Then, the thumbnail gets generated in the step 5 and then in step 6 it returns to the client a redirect pointing to the new
generated thumbnail. At this point when the client is going to follow this redirect, it will hit cloudfront and instead of
returning the new s3 object, it will return what cached in the previous step (3).

At the end you will have the following loop: `3 -> 4 -> 5 -> 3 -> 4 -> 5 -> 3 -> 4 -> 5 ...`.

Optionally this repo provides an inline function called `disable-cache-cloudfront-lambda` by default (it does not require to be
hosted in S3). But if you want to provide it yourself, here are some pointers:

The solution will be something like this: Find a way so that cloudfront does not cache the temp redirects (302 or 307).
Sadly there is not a "simple" solution, because cloudfront is not that "smart".

The solution is to make cloudfront smart using `Lambda@Edge`. Basically, the idea is to create a lambda function that will
look something like this (node@12 the 14 is not supported by lambda@edge yet):

```javascript
'use strict';

exports.handler = (event, context, callback) => {
  const response = event.Records[0].cf.response;
  
  if (response.status.match(/^30[27]/)) {
    response.headers['cache-control'] = [{ 
      key: 'Cache-Control', 
      value: 'no-cache, no-store, private' 
    }];
  }
  return callback(null, response);
};

```

An access role is also required. In cloudformation the property is `AssumeRolePolicyDocument` from the `AWS::IAM::Role`.
If you are configuring it manually, it is located in the tab `Trust relationships` in the role configuration in `IAM`.
The role looks like this (don't forget `edgelambda.amazonaws.com`):

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Principal": {
        "Service": [
          "lambda.amazonaws.com",
          "edgelambda.amazonaws.com"
        ]
      },
      "Action": "sts:AssumeRole"
    }
  ]
}
```

Finally, you just need to link the cloudfront distribution with the lambda function we just created, I suggest you do it 
from the lambda panel (it can also be done from the cloudfront panel).
In the lambda panel, click on `Actions` and `Deploy Lambda@Edge`, after that select the correct cf distribution and event 
type `origin-response`.

PD: Do not forget to create a cloudfront invalidation in order to see the changes.
