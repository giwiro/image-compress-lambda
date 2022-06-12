import {S3Client, PutObjectCommand} from '@aws-sdk/client-s3';
import chalk from 'chalk';
import fs from 'fs';
import path from 'path';

const resolveApp = (relativePath: string) =>
  path.resolve(fs.realpathSync(process.cwd()), relativePath);

const buildZipDirectory = resolveApp('build-zip');
const provisionDirectory = resolveApp('provision');

const s3 = new S3Client({
  region: process.env['S3_REGION'],
});

function verifyEnvVariable(variable: string): Promise<void> {
  return new Promise((resolve, reject) => {
    if (!process.env[variable]) {
      return reject(new Error(`Environment variable ${variable} is not set.`));
    }
    return resolve();
  });
}

Promise.resolve()
  .then(() => verifyEnvVariable('S3_BUCKET'))
  .then(() => verifyEnvVariable('S3_REGION'))
  .catch((error: Error) => {
    console.error(`${chalk.red('[λ]')} ${error.message}`);
    process.exit(1);
  })
  .then(async () => {
    const zipFileStream = fs.createReadStream(
      `${buildZipDirectory}/image-compress-lambda.zip`
    );

    console.log(
      `${chalk.cyan('[λ]')} Upload 'lambda/image-compress-lambda.zip' to '${
        process.env['S3_BUCKET']
      }'`
    );

    await s3.send(
      new PutObjectCommand({
        Bucket: process.env['S3_BUCKET'],
        Key: 'lambda/image-compress-lambda.zip',
        Body: zipFileStream,
      })
    );
  })
  .then(async () => {
    const cfFilStream = fs.createReadStream(`${provisionDirectory}/main.yaml`);

    console.log(
      `${chalk.cyan('[λ]')} Upload 'provision/main.yaml' to '${
        process.env['S3_BUCKET']
      }'`
    );

    await s3.send(
      new PutObjectCommand({
        Bucket: process.env['S3_BUCKET'],
        Key: 'provision/main.yaml',
        Body: cfFilStream,
      })
    );
  })
  .then(() =>
    console.log(`${chalk.cyan('[λ]')} ${chalk.green('Upload successful')}`)
  );
