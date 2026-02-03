import chalk from 'chalk';

function isBannerDisabled(): boolean {
  const v = (
    process.env.LEE_SPEC_KIT_NO_BANNER ||
    ''
  ).trim();
  return v === '1';
}

export function getBanner(opts?: { version?: string }): string {
  if (isBannerDisabled()) return '';

  // Keep the original glyph design, but split into 3 blocks (LEE / SPEC / KIT)
  // to avoid an overly wide single-line banner in typical terminals.
  const lee = `
░██         ░██████████ ░██████████ 
░██         ░██         ░██         
░██         ░██         ░██         
░██         ░█████████  ░█████████  
░██         ░██         ░██         
░██         ░██         ░██         
░██████████ ░██████████ ░██████████ 
  `;

  const spec = `
  ░██████   ░█████████  ░██████████   ░██████  
 ░██   ░██  ░██     ░██ ░██          ░██   ░██ 
░██         ░██     ░██ ░██         ░██        
 ░████████  ░█████████  ░█████████  ░██        
        ░██ ░██         ░██         ░██        
 ░██   ░██  ░██         ░██          ░██   ░██ 
  ░██████   ░██         ░██████████   ░██████  
  `;

  const kit = `
░██     ░██ ░██████░██████████
░██    ░██    ░██      ░██    
░██   ░██     ░██      ░██    
░███████      ░██      ░██    
░██   ░██     ░██      ░██    
░██    ░██    ░██      ░██    
░██     ░██ ░██████    ░██    
  `;

  const ascii = `${lee}${spec}${kit}`;

  const version = opts?.version ? `v${opts.version}` : '';
  const footer = version ? `\n${version}\n` : '\n';

  if (process.stdout.isTTY) {
    return `${chalk.cyan(ascii)}${chalk.gray(footer)}`;
  }
  return `${ascii}${footer}`;
}
