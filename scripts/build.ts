import archiver from 'archiver';
import chalk from 'chalk';
import {Readable} from 'stream';
import {exec} from 'child_process';
import path from 'path';
import fs from 'fs';
import packageJson from '../package.json';

const resolveApp = (relativePath: string) =>
  path.resolve(fs.realpathSync(process.cwd()), relativePath);

const rootDirectory = resolveApp('.');
const buildDirectory = resolveApp('build');
const buildZipDirectory = resolveApp('build-zip');

function deleteDir(dir: string): Promise<void> {
  return new Promise((resolve, reject) => {
    fs.rm(dir, {recursive: true, force: true}, (err) => {
      if (err) reject(err);
      else resolve();
    });
  });
}

function copyPackageJson(): Promise<void> {
  return new Promise((resolve) => {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const {scripts, devDependencies, ...publicPackageJson} = packageJson;
    const write = fs.createWriteStream(`${buildDirectory}/package.json`);
    Readable.from([JSON.stringify(publicPackageJson, null, 2)]).pipe(write);
    write.on('finish', () => resolve());
  });
}

function execCommand(cmd: string, cwd: string): Promise<string> {
  return new Promise((resolve, reject) => {
    exec(cmd, {cwd}, (err, stdout, stderr) => {
      if (err || stderr) {
        return reject(err);
      }

      return resolve(stdout);
    });
  });
}

function zipDirectory(zipDir: string, outDir: string): Promise<void> {
  const archive = archiver('zip', {zlib: {level: 9}});

  const output = fs.createWriteStream(outDir);

  return new Promise((resolve, reject) => {
    output.on('close', () => resolve());

    archive.on('error', (error) => {
      console.error('ERROR', error);
      reject();
    });

    archive.pipe(output);
    archive.directory(zipDir, false, undefined);
    archive.finalize().then(() => null);
  });
}

Promise.resolve()
  .then(() => {
    console.log(`${chalk.cyan('[λ]')} Delete build directory`);
    return deleteDir(buildDirectory);
  })
  .then(() => {
    console.log(`${chalk.cyan('[λ]')} Delete build-zip directory`);
    return deleteDir(buildZipDirectory);
  })
  .then(() => {
    console.log(`${chalk.cyan('[λ]')} SWC compile`);

    // Compile
    return execCommand('npm run compile', rootDirectory).then((stdout) => {
      console.log(stdout);
      return Promise.resolve();
    });
  })
  .then(() => {
    console.log(`${chalk.cyan('[λ]')} Copying package.json`);
    return copyPackageJson();
  })
  .then(() => {
    console.log(`${chalk.cyan('[λ]')} Installing production dependencies`);
    return execCommand(
      'npm install --loglevel=error --production',
      buildDirectory
    );
  })
  .then(() => {
    console.log(`${chalk.cyan('[λ]')} Reinstalling sharp for linux x64`);
    return deleteDir(`${buildDirectory}/node_modules/sharp`).then(() =>
      execCommand(
        'npm install --arch=x64 --platform=linux sharp',
        buildDirectory
      )
    );
  })
  .then(() => {
    if (!fs.existsSync(buildZipDirectory)) {
      fs.mkdirSync(buildZipDirectory);
    }
    console.log(`${chalk.cyan('[λ]')} Creating zip`);
    return zipDirectory(
      buildDirectory,
      `${buildZipDirectory}/image-compress-lambda.zip`
    );
  })
  .then(() =>
    console.log(`${chalk.cyan('[λ]')} ${chalk.green('Build successful')}`)
  );
