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
    if (/(?:set(?:Error|Notice|Message)\([^)]*String\((?:e|error|cause)\)\)|\{\s*(?:e|error|cause)\.message\s*\})/i.test(line)) addFinding(file, index + 1, 'raw-technical-error-review', 'review', 'Map exception details to an operator-safe message and a recovery action; retain technical detail only in diagnostics.', line);
    if (/className\s*=\s*["'`][^"'`]*\bfixed\s+inset-0/.test(line) && !/role\s*=\s*["']dialog["']/.test(line) && !/Dialog|Modal|Drawer/.test(file)) addFinding(file, index + 1, 'custom-overlay-review', 'warning', 'Review this fixed overlay for dialog semantics, focus handling, and small-screen scrolling.', line);
    const matches = [...line.matchAll(/<(button|input|select|textarea|form)\b|\b(onClick|onSubmit|onChange)\s*=|\bcase\s+["']([^"']+)["']\s*:/g)];
    for (const match of matches) {
      const kind = match[1] || match[2] || 'route';
      const id = `${row.file}:${row.line}:${match.index}`;
      interactions.push({ id, workspace: file.split(/[\\/]/).slice(-2, -1)[0] || 'application', file: row.file, surface: kind, operatorIntent: 'Requires operator review', operatorInputs: [], servosDerivedValues: [], contextPrefill: [], defaultSource: 'Requires policy review', primaryAction: null, disabledReason: null, busyState: /busy|pending|loading|submitting/i.test(source) ? 'Possible; confirm for this workflow' : 'Unreviewed', errorRecovery: 'Unreviewed', permission: 'Requires workflow review', businessTimezone: /datetime-local|startsAt|endsAt|receivedAt/.test(line) ? 'Unreviewed; see finding if applicable' : 'Not applicable or unreviewed', mobileStatus: 'UNREVIEWED', keyboardStatus: 'UNREVIEWED', helpAnchor: null, acceptanceTest: 'Exercise validation, permission denial, durable result, conflict and recovery.', status: 'UNREVIEWED' });
    }
  });
  for (const form of source.matchAll(/<form\b[\s\S]*?<\/form>/g)) {
    const requiredCount = [...form[0].matchAll(/<(?:input|select|textarea)\b[^>]*\brequired\b/g)].length;
    if (requiredCount > 5) {
      const line = source.slice(0, form.index).split('\n').length;
      addFinding(file, line, 'excessive-required-fields', 'review', `Form has ${requiredCount} statically required fields; verify each is essential and not derivable from existing context.`, form[0]);
    }
  }
  for (const button of source.matchAll(/<button\b[^>]*>/g)) {
    if (!/\bdisabled(?:\s|=|>)/.test(button[0])) continue;
    if (/\b(?:title|aria-describedby)\s*=/.test(button[0])) continue;
    const nearby = source.slice(button.index + button[0].length, button.index + button[0].length + 260);
    if (!/(?:must|need|requires?|permission|role|select|choose|unavailable|blocked|open till|cannot|can not|no .* available)/i.test(nearby)) {
      const line = source.slice(0, button.index).split('\n').length;
      addFinding(file, line, 'disabled-action-explanation-review', 'review', 'Disabled action has no nearby detectable explanation; verify its reason is visible and accessible.', button[0]);
    }
  }
  if (/<form\b/.test(source) && !/\bbusy\b|\bpending\b|\bsubmitting\b|\bisLoading\b/i.test(source)) addFinding(file, 1, 'form-busy-state-review', 'review', 'Form has no obvious busy state in the component source; review duplicate-submit protection.', '<form>');
  if (/role\s*=\s*["']dialog["']/.test(source) && !/aria-modal|<dialog\b/.test(source)) addFinding(file, 1, 'dialog-accessibility-review', 'review', 'Dialog surface lacks a detectable modal declaration; review focus and dismissal behavior.', 'dialog component');
}

fs.mkdirSync('docs/generated', { recursive: true });
fs.writeFileSync('docs/generated/UI_INTERACTION_INVENTORY.json', JSON.stringify({ generatedBy: 'npm run audit:ui', scope: 'Static source inventory; findings require human review and are not runtime acceptance', count: interactions.length, interactions }, null, 2) + '\n');
fs.writeFileSync('docs/generated/OPERATOR_UX_AUDIT.json', JSON.stringify({ schemaVersion: 1, generatedBy: 'npm run audit:ui', generatedAt: new Date().toISOString(), scope: 'Static source signals plus unreviewed workflow inventory; generation does not imply acceptance', interactionCount: interactions.length, findingCount: findings.length, findings, interactions }, null, 2) + '\n');
console.log(`Inventoried ${interactions.length} UI interactions and ${findings.length} review findings. Operator workflows remain UNREVIEWED until accepted evidence is recorded.`);
