# General Code Style Principles

This document outlines general coding principles that apply across all languages
and frameworks used in this project.

## Readability

-   Code should be easy to read and understand by humans.
-   Avoid overly clever or obscure constructs.

## Consistency

-   Follow existing patterns in the codebase.
-   Maintain consistent formatting, naming, and structure.

## Simplicity

-   Prefer simple solutions over complex ones.
-   Break down complex problems into smaller, manageable parts.

## Maintainability

-   Write code that is easy to modify and extend.
-   Minimize dependencies and coupling.

## Documentation

-   Document *why* something is done, not just *what*.
-   Keep documentation up-to-date with code changes.

## Correctness before polish

-   A task is finished when it meets the spec **and** the gate passes, not when the code looks done.
    See [../workflow.md](../workflow.md) (Spec conformance, Definition of Done).
-   Do not claim what you did not check. Separate "tested against a fake" from "verified against the real service".
-   When something in the spec cannot or will not be done, say so explicitly; never tick it off silently.
-   Language- and API-specific rules: [typescript.md](./typescript.md), [testing.md](./testing.md),
    [google-apis.md](./google-apis.md).

