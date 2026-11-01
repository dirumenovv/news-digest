import Handlebars from 'handlebars';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { buildViewModel, renderText } from './viewmodel.js';

const DEFAULT_TEMPLATE = fileURLToPath(new URL('../templates/digest.hbs', import.meta.url));

/**
 * Renders the digest. Handlebars' {{ }} escapes HTML by default, so feed
 * content can never inject markup into the email.
 */
export async function renderDigest(sections, config, { now, templatePath = DEFAULT_TEMPLATE } = {}) {
  const source = await readFile(templatePath, 'utf8');
  const template = Handlebars.compile(source);
  const vm = buildViewModel(sections, config, { now });

  return { subject: vm.subject, html: template(vm), text: renderText(vm) };
}
