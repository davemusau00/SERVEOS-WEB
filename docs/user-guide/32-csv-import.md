# Import master data

Section: Administration
Roles: Admin, Manager
Permission: data.import.stage
Screen: settings
Keywords: CSV, import, template, dry run, external ID

## Overview

Use the API Import Center for supported create-only master data.

## Procedure

1. Download the template from the Import Center.
2. Fill the required columns and preserve the exact header names.
3. Import dependency files first and keep external IDs stable.
4. Stage the file and review validation errors.
5. Run the server dry run, then apply only a ready plan after review.

## What ServOS handles

The API validates rows and applies each accepted row using a normal domain command.

## Common mistakes and correction

Do not add unsupported columns or use the operator importer for staff credentials, opening stock or historical transactions. Correct a blocked import in a fresh batch.
