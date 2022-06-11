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
// https://uploads.domain.io/public/80x80/331C474F-61FC-4E2B-9242-4AA7C29B389D.png;
export function parseUrlPath(urlPath: string): {
  path: string;
  dimensions: string;
  fileName: string;
  originalObjectKey: string;
} {
  const reg =
    /^(https?:\/\/[\w\-.]+?)(\/.*?)(\d+x\d+)\/([a-zA-Z\d_\-.~?=&\[\]]+?)$/;
  const match = urlPath.match(reg);

  if (!match || match[0] !== urlPath || match.length !== 5) {
    throw new Error('Wrong url path format: ' + urlPath);
  }

  const path = match[2].startsWith('/') ? match[2].slice(1) : match[2];

  return {
    path,
    dimensions: match[3],
    fileName: match[4],
    originalObjectKey: `${path}${match[4]}`,
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
