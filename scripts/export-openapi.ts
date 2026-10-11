import { readFile, writeFile } from 'node:fs/promises';
import { format, resolveConfig } from 'prettier';
import { openApiDocument } from '../src/server/patient-api/openapi';
const path = 'docs/mobile/openapi.json';
const content = await format(JSON.stringify(openApiDocument()), {
  ...(await resolveConfig(path)),
  parser: 'json',
});
if (process.argv.includes('--check')) {
  if ((await readFile(path, 'utf8')) !== content)
    throw new Error('OpenAPI desatualizado. Execute npm run api:export.');
  console.log('OpenAPI está sincronizado com os contratos da API.');
} else {
  await writeFile(path, content);
  console.log(`Contrato exportado em ${path}.`);
}
