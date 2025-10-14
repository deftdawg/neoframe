## Project Overview

- Refer to the README.md file for project overview

## Dev environment tips

- Think hard to produce solutions that are as simple and concise as possible to achieve the requirements
- Use `devbox` to manage dependencies, do not specify package versions, include colourize build and example run instructions in the init_hook along with any pre-build setup that needs to be done.
- Use `bun` to build project for all targets
- Anytime a UI control is implemented, it should be done such that if it's state is active on restoration that element is visible to the user and if that control takes input from the user it has a debounce delay of 2 seconds before it effects any rendering changes to avoid frustrating the user with too many rerendering delays
- When you complete a task successfully or unsuccessfully add a comment to the PR and push the commits to the working branch, DON'T MAKE THE USER HAVE TO ASK OR FOLLOW UP WITH YOU TO DO SO!
- When working on your working branch, if the last commit was made by the user, it is the user fixing or improving your work, take the time to understand what was done and attempt to preserve/learn from it rather than reverting it in your new commits.

## Documentation

- When you open a pull request make the title and summary something meaningful, title could be your new branch name, summary can start with the standard `Fixes #issue` line but should also include a brief statement of what the original issue was and what you changed in the PR.
- Do not delete code comments unless the code accompanying them has also been deleted/changed to make them irrelavant
- Whenever you are asked to produced documentation do so in Markdown format
- Where diagrams are required use Mermaid diagrams, be sure to properly quote all strings so as to not produce mermaid parser errors (if you can test that mermaid diagrams render before including them even better)
- Whenever the user asks you to implement new requirements add them to the New Requirements section at the bottom of this document with enough detail you could reproduce them by reading this document alone

## New Requirements

### General Communication

- The ESP32 does not return CORS headers `'no-cors' mode` must be used when communicating with it, this is particularily important for the health check functions

### QR Codes

- QR Codes need to be placed relative to the orientation of the rotated image (not the physical panel), similarily QR margins need to be from the image as it will be rendered on the target field of view.  So if the Field of View is for the RODALM the QR margins need to be from the edge of what is viewable, not the panel edge
