import {Stream} from 'stream';

export function extractDimensions(dimensions = ''): [number, number] {
  const reg = /^(\d+?)x(\d+?)$/;
  const match = dimensions.match(reg);

  if (!match || match[0] !== dimensions) {
    throw new Error('Wrong dimensions format');
  }

  const width = parseInt(match[1], 10);
  const height = parseInt(match[2], 10);

  if (isNaN(width) || isNaN(height)) {
    throw new Error('Could not parse width or height');
  }

  return [width, height];
}

// example:
//
// The original file url is this: https://uploads.domain.io/public/331C474F-61FC-4E2B-9242-4AA7C29B389D.png
// so we put a "<width>x<height>" format string before the filename:
// https://uploads.domain.io/public/80x80/331C474F-61FC-4E2B-9242-4AA7C29B389D.png
// so the path parameter would be just "/local/public/80x80/331C474F-61FC-4E2B-9242-4AA7C29B389D.png"
// why 'local' prefix? because in the S3 404 redirect config to APIGateway, it will replace 'public'
// to 'local/public', so we need to remove it in order to look for the original s3 object
export function parseUrlPath(
  path: string,
  stage: string
): {
  path: string;
  dimensions: string;
  fileName: string;
  originalObjectKey: string;
  newObjectKey: string;
} {
  const pathNoStage = path.replace(`/${stage}`, '');

  const reg = /^(\/.*?)(\d+x\d+)\/([a-zA-Z\d_\-.~?=&\[\]]+?)$/;
  const match = pathNoStage.match(reg);

  if (!match || match[0] !== pathNoStage || match.length !== 4) {
    throw new Error(
      `Wrong url path format: ${path}\n\npath without stage: ${pathNoStage}`
    );
  }

  const normalizedPath = match[1].startsWith('/')
    ? match[1].slice(1)
    : match[1];

  console.log(
    'return',
    JSON.stringify({
      path: normalizedPath,
      dimensions: match[2],
      fileName: match[3],
      originalObjectKey: `${normalizedPath}${match[3]}`,
      newObjectKey: `${normalizedPath}${match[2]}/${match[3]}`,
    })
  );

  return {
    path: normalizedPath,
    dimensions: match[2],
    fileName: match[3],
    originalObjectKey: `${normalizedPath}${match[3]}`,
    newObjectKey: `${normalizedPath}${match[2]}/${match[3]}`,
  };
}

export function streamToBuffer(stream: Stream): Promise<Buffer> {
  const chunks: any[] = [];

  return new Promise((resolve, reject) => {
    stream.on('data', (chunk) => chunks.push(chunk));

    stream.once('error', () =>
      reject(new Error('Could not transform stream to buffer'))
    );

    stream.once('end', () => resolve(Buffer.concat(chunks)));
  });
}
