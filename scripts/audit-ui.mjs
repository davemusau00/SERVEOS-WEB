import fs from 'node:fs';
import path from 'node:path';

const walk = dir => fs.readdirSync(dir, { withFileTypes: true }).flatMap(entry => entry.isDirectory() ? walk(path.join(dir, entry.name)) : [path.join(dir, entry.name)]);
const files = walk('src').filter(file => /\.tsx$/.test(file));
const interactions = [];
const findings = [];
const addFinding = (file, line, rule, severity, message, source) => findings.push({ file: file.replaceAll('\\', '/'), line, rule, severity, message, source: source.trim().slice(0, 500) });

for (const file of files) {
  const lines = fs.readFileSync(file, 'utf8').split('\n');
  const source = lines.join('\n');
  lines.forEach((line, index) => {
    const row = { file: file.replaceAll('\\', '/'), line: index + 1, source: line.trim() };
    if (/\bwindow\.(?:prompt|confirm)\s*\(/.test(line)) addFinding(file, index + 1, 'native-browser-prompt', 'error', 'Replace browser prompt/confirm with an accessible in-app workflow.', line);
    if (/\bdisabled\b/.test(line) && /disabled:opacity-(?:[0-9]+|\[)/.test(line) && !/disabled:(?:cursor-not-allowed|opacity)/.test(line)) addFinding(file, index + 1, 'disabled-action-visibility', 'warning', 'Disabled action may rely on opacity alone; provide an explanation and visible state.', line);
    if (/type\s*=\s*["']datetime-local["']/.test(line) && !/BusinessDateTimeField|data-business-timezone/.test(line)) addFinding(file, index + 1, 'business-time-input', 'warning', 'Use the property timezone contract when converting this business wall time.', line);
    if (/className\s*=\s*["'`][^"'`]*\bfixed\s+inset-0/.test(line) && !/role\s*=\s*["']dialog["']/.test(line) && !/Dialog|Modal|Drawer/.test(file)) addFinding(file, index + 1, 'custom-overlay-review', 'warning', 'Review this fixed overlay for dialog semantics, focus handling, and small-screen scrolling.', line);
    const matches = [...line.matchAll(/<(button|input|select|textarea|form)\b|\b(onClick|onSubmit|onChange)\s*=|\bcase\s+["']([^"']+)["']\s*:/g)];
    for (const match of matches) {
      const kind = match[1] || match[2] || 'route';
      const id = `${row.file}:${row.line}:${match.index}`;
      interactions.push({ id, workspace: file.split(/[\\/]/).slice(-2, -1)[0] || 'application', file: row.file, surface: kind, operatorIntent: 'Requires operator review', operatorInputs: [], servosDerivedValues: [], contextPrefill: [], defaultSource: 'Requires policy review', primaryAction: null, disabledReason: null, busyState: /busy|pending|loading|submitting/i.test(source) ? 'Possible; confirm for this workflow' : 'Unreviewed', errorRecovery: 'Unreviewed', permission: 'Requires workflow review', businessTimezone: /datetime-local|startsAt|endsAt|receivedAt/.test(line) ? 'Unreviewed; see finding if applicable' : 'Not applicable or unreviewed', mobileStatus: 'UNREVIEWED', keyboardStatus: 'UNREVIEWED', helpAnchor: null, acceptanceTest: 'Exercise validation, permission denial, durable result, conflict and recovery.', status: 'UNREVIEWED' });
    }
  });
  if (/<form\b/.test(source) && !/\bbusy\b|\bpending\b|\bsubmitting\b|\bisLoading\b/i.test(source)) addFinding(file, 1, 'form-busy-state-review', 'review', 'Form has no obvious busy state in the component source; review duplicate-submit protection.', '<form>');
  if (/role\s*=\s*["']dialog["']/.test(source) && !/aria-modal|<dialog\b/.test(source)) addFinding(file, 1, 'dialog-accessibility-review', 'review', 'Dialog surface lacks a detectable modal declaration; review focus and dismissal behavior.', 'dialog component');
}

fs.mkdirSync('docs/generated', { recursive: true });
fs.writeFileSync('docs/generated/UI_INTERACTION_INVENTORY.json', JSON.stringify({ generatedBy: 'npm run audit:ui', scope: 'Static source inventory; findings require human review and are not runtime acceptance', count: interactions.length, interactions }, null, 2) + '\n');
fs.writeFileSync('docs/generated/OPERATOR_UX_AUDIT.json', JSON.stringify({ schemaVersion: 1, generatedBy: 'npm run audit:ui', generatedAt: new Date().toISOString(), scope: 'Static source signals plus unreviewed workflow inventory; generation does not imply acceptance', interactionCount: interactions.length, findingCount: findings.length, findings, interactions }, null, 2) + '\n');
console.log(`Inventoried ${interactions.length} UI interactions and ${findings.length} review findings. Operator workflows remain UNREVIEWED until accepted evidence is recorded.`);
