// eslint-disable-next-line @typescript-eslint/no-var-requires
const Sharp = require('sharp');
import {APIGatewayProxyHandlerV2} from 'aws-lambda';
import vars, {checkVars} from './vars';
import {
  GetObjectCommand,
  GetObjectOutput,
  GetObjectTaggingCommand,
  GetObjectTaggingOutput,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import * as zlib from 'zlib';
import {extractDimensions, parseUrlPath, streamToBuffer} from './utils';

const handler: APIGatewayProxyHandlerV2 = async (
  event,
  _,
  callback
): Promise<any> => {
  try {
    checkVars();
  } catch (e) {
    const error = e as Error;
    return callback(undefined, {
      statusCode: 500,
      body: error.message,
    });
  }

  const s3 = new S3Client({
    region: vars.region,
  });

  const urlPath = event.requestContext.http.path;

  if (!urlPath) {
    return callback(undefined, {
      statusCode: 400,
      body: 'Path does not exist: ' + urlPath,
    });
  }

  let width: number;
  let height: number;
  let originalKey: string;
  let newObjectKey: string;

  let originalObject: GetObjectOutput;
  let originObjectTags: GetObjectTaggingOutput;

  try {
    const {
      dimensions,
      originalObjectKey,
      newObjectKey: nok,
    } = parseUrlPath(urlPath, event.requestContext.stage);

    originalKey = originalObjectKey;
    [width, height] = extractDimensions(dimensions);
    newObjectKey = nok;
  } catch (e) {
    const error = e as Error;
    return callback(undefined, {
      statusCode: 400,
      body: error.message,
    });
  }

  try {
    originalObject = await s3.send(
      new GetObjectCommand({
        Bucket: vars.bucket,
        Key: originalKey,
      })
    );

    originObjectTags = await s3.send(
      new GetObjectTaggingCommand({
        Bucket: vars.bucket,
        Key: originalKey,
      })
    );
  } catch (e) {
    const error = e as Error;
    return callback(undefined, {
      statusCode: 424,
      body: `Could not get original object [${originalKey}] from bucket [${vars.bucket}]:\n\n${error.message}`,
    });
  }

  if (
    originalObject.ContentType &&
    !originalObject.ContentType.startsWith('image')
  ) {
    return callback(undefined, {
      statusCode: 400,
      body: 'Request is not an image',
    });
  }

  if (
    originObjectTags.TagSet &&
    !originObjectTags.TagSet.find(
      (t) => t.Key === 'auto_thumbnail' && t.Value === 'true'
    )
  ) {
    return callback(undefined, {
      statusCode: 422,
      body: 'Image is not eligible for creating automatic thumbnails',
    });
  }

  if (
    originObjectTags.TagSet &&
    originObjectTags.TagSet.find(
      (t) => t.Key === 'thumbnail' && t.Value === 'true'
    )
  ) {
    return callback(undefined, {
      statusCode: 422,
      body: 'Image is already a thumbnail',
    });
  }

  let transformer = Sharp().resize(width, height);

  if (originalObject.ContentType === 'image/jpeg') {
    transformer = transformer.jpeg({quality: 80}).toFormat('jpg');
  } else if (originalObject.ContentType === 'image/png') {
    transformer = transformer.png({quality: 80}).toFormat('png');
  }

  originalObject.Body.pipe(transformer);

  const t = transformer.pipe(zlib.createGzip());

  try {
    const buffer = await streamToBuffer(t);

    await s3.send(
      new PutObjectCommand({
        Bucket: vars.bucket,
        Key: newObjectKey,
        Body: buffer,
        CacheControl: 'public, max-age=31536000',
        ContentType: originalObject.ContentType as string,
        ContentEncoding: 'gzip',
        Tagging: 'thumbnail=true',
      })
    );
  } catch (e) {
    const error = e as Error;
    return callback(undefined, {
      statusCode: 424,
      body: `Could not save thumbnail to the bucket:\n\n${error.message}`,
    });
  }

  return callback(null, {
    statusCode: 301,
    headers: {
      location: `${vars.rootUrl}${newObjectKey}`,
    },
    body: '',
  });
};

export default handler;
