# Contributing to ALIENX

Thank you for your interest in contributing to ALIENX! This document provides guidelines and information for contributors.

## Ways to Contribute

### Bug Reports

If you find a bug, please open an issue with:

- A clear, descriptive title
- Steps to reproduce the issue
- Expected vs. actual behavior
- Screenshots or error messages if applicable
- Your browser version and operating system

### Feature Requests

We welcome feature suggestions! Please:

- Check existing issues first to avoid duplicates
- Clearly describe the feature and its use case
- Explain how it benefits users or improves the tool

### Code Contributions

We appreciate code contributions! Please follow the process below.

## Development Setup

1. **Fork the repository** on GitHub

2. **Clone your fork:**

   ```bash
   git clone https://github.com/YOUR_USERNAME/ALIENX.git
   cd ALIENX
   ```

3. **Install dependencies:**

   ```bash
   npm install
   ```

4. **Create a feature branch:**

   ```bash
   git checkout -b feature/your-feature-name
   ```

5. **Start the development server:**
   ```bash
   npm run dev
   ```
   Open `http://localhost:5173` in your browser

## Making Changes

### Code Style

- Follow existing code patterns and conventions
- Use TypeScript for type safety
- Write clear, descriptive variable and function names
- Add comments for complex logic

### Testing Your Changes

Before submitting a pull request:

1. **Test manually:**
   - Load sample data and verify basic functionality
   - Test with real EVTX files if possible
   - Check both light and dark themes
   - Test on different browsers (Chrome, Firefox, Safari, Edge)

2. **Build the project:**

   ```bash
   npm run build
   ```

   Ensure the build completes without errors

3. **Check for TypeScript errors:**
   ```bash
   npx tsc --noEmit
   ```

### Commit Guidelines

- Write clear, concise commit messages
- Use present tense ("Add feature" not "Added feature")
- Reference issues when applicable (#123)
- Break large changes into smaller, logical commits

Example:

```
Add dark mode toggle to settings panel (#45)

- Implemented theme switching logic
- Updated CSS variables for theme consistency
- Added localStorage persistence for theme preference
```

## Pull Request Process

1. **Update your branch** with the latest changes from main:

   ```bash
   git checkout main
   git pull upstream main
   git checkout feature/your-feature-name
   git rebase main
   ```

2. **Push your changes:**

   ```bash
   git push origin feature/your-feature-name
   ```

3. **Create a Pull Request** on GitHub with:
   - A descriptive title
   - A detailed description of the changes
   - Screenshots or GIFs for UI changes
   - Reference to any related issues

4. **Address review feedback** - maintainers may request changes

5. **Merge** - once approved, your PR will be merged!

## Areas for Contribution

Looking for ideas? Here are some areas that could use help:

### SIGMA Rules

- Adding new SIGMA detection rules to `src/sigma-master/rules/`
- Improving existing rule accuracy
- Testing rules against real-world event logs

### Performance

- Optimizing large file parsing
- Reducing memory usage during analysis
- Improving chart rendering performance

### UI/UX

- Enhancing visualizations
- Improving mobile responsiveness
- Adding accessibility features
- Refining dark mode styling

### Features

- Export capabilities (PDF reports, CSV exports)
- Additional log format support
- Custom SIGMA rule editor
- Advanced filtering options

### Documentation

- Code comments and JSDoc
- User guides and tutorials
- Architecture documentation
- Example use cases

## Code Review Expectations

Pull requests will be reviewed for:

- **Functionality** - Does it work as intended?
- **Code quality** - Is it clean, readable, and maintainable?
- **Performance** - Does it impact application performance?
- **Security** - Are there any security concerns?
- **Compatibility** - Does it work across browsers?

## Community Guidelines

- Be respectful and constructive in all interactions
- Follow the [Code of Conduct](CODE_OF_CONDUCT.md) (if available)
- Help others when you can
- Ask questions if you're unsure

## Questions?

If you have questions about contributing:

- Open a [GitHub Discussion](https://github.com/Koifman/ALIENX/discussions)
- Comment on relevant issues
- Review existing documentation

## License

By contributing to ALIENX, you agree that your contributions will be licensed under the MIT License.

---

Thank you for helping make ALIENX better!
