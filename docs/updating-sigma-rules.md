# Updating Detection Rules

ALIENX uses detection rules from multiple sources, maintained as Git submodules.

## Automatic Updates (Recommended)

The build process automatically syncs detection rules from upstream repositories:

```bash
# Build automatically syncs and bundles latest rules
npm run build
```

This runs:

1. `npm run sync:sigma` - Updates SIGMA and Chainsaw submodules
2. `npm run bundle:sigma` - Bundles SIGMA rules into JSON
3. TypeScript compilation and Vite build

## Manual Updates

### Update All Detection Rules

To manually sync all detection rules:

```bash
# Sync both SIGMA and Chainsaw rules from upstream
npm run sync:sigma

# Rebuild the bundled rules
npm run bundle:sigma

# Commit the updated rules
git add src/sigma-master src/chainsaw-rules public/sigma-rules
git commit -m "Update detection rules to latest versions"
```

### Update Only SIGMA Rules

To pull the latest SIGMA rules from upstream:

```bash
# Update the submodule to latest from SigmaHQ
git submodule update --remote src/sigma-master

# Rebuild the bundled rules
npm run bundle:sigma

# Commit the updated rules
git add src/sigma-master public/sigma-rules
git commit -m "Update SIGMA rules to latest version"
```

### Update Only Chainsaw Rules

To pull the latest Chainsaw rules from upstream:

```bash
# Update the submodule to latest from Chainsaw
git submodule update --remote src/chainsaw-rules

# Commit the updated rules
git add src/chainsaw-rules
git commit -m "Update Chainsaw detection rules"
```

**Note:** Chainsaw's native tau detection rules are included as a reference. These are **not SIGMA format** and are not currently integrated into ALIENX's detection engine, but serve as valuable reference material for threat hunting patterns.

## Current Configuration

### SIGMA Rules (Active)

- **Submodule**: `src/sigma-master`
- **Source**: https://github.com/SigmaHQ/sigma.git
- **Used Paths**: Only `rules/windows/*` is bundled during build
- **Bundled Output**: `public/sigma-rules/*.json`
- **Rule Count**: ~2,356 Windows detection rules

### Chainsaw Rules (Reference)

- **Submodule**: `src/chainsaw-rules`
- **Source**: https://github.com/WithSecureLabs/chainsaw.git
- **Used Paths**: Only `rules/evtx/*` is bundled during build
- **Format**: Chainsaw tau (not SIGMA)
- **Rule Count**: 74 Windows-focused detection rules

## How It Works

The full SIGMA and Chainsaw repositories are included as Git submodules. While these repos contain rules for multiple platforms (Linux, macOS, Cloud, etc.), **only the Windows-specific rules are bundled during the build process**:

- SIGMA: Only `rules/windows/*` is processed
- Chainsaw: Only `rules/evtx/*` is processed

The build scripts (`bundle-sigma-rules.js` and `bundle-chainsaw-rules.js`) extract only the relevant rule files and bundle them into JSON files in the `public/` directory. This means:

- **Development**: Full submodules are cloned (larger initial clone)
- **Production**: Only the bundled Windows rules are included in the final app
- **End Users**: Never download the submodules - they only get the bundled rules

This approach keeps the production bundle lean while maintaining easy updates from upstream rule repositories.
