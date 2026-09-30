export function disabledOpacityFinding(line){
  if(!/<(?:button|input|select|textarea)\b|\bclassName\s*=/.test(line)||!/\bdisabled\b/.test(line))return false;
  const classes=[...line.matchAll(/disabled:([^\s"'`]+)/g)].map(match=>match[1]);
  const opacityOnly=classes.some(value=>/^opacity(?:-|$)/.test(value));
  const visibleState=classes.some(value=>/^(?:cursor-not-allowed|grayscale|ring-|border-)/.test(value));
  return opacityOnly&&!visibleState;
}
