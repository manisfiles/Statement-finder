# Statement Finder

A privacy-first Next.js MVP for searching and summarizing transactions in bank statement PDFs.

## What it does

- Accepts one or more bank statement PDFs in the browser.
- Extracts text from every PDF page with PDF.js.
- Optionally runs Tesseract OCR on pages that do not contain embedded text.
- Converts transaction-like rows into structured JSON with date, description, debit, credit, balance, source file, and page.
- Searches transactions by keyword/person name and calculates match count, total credits, total debits, and net amount.

## Privacy model

The current MVP processes files client-side. PDFs are not uploaded to an application server, which reduces banking-data exposure. A production backend should keep temporary uploads encrypted, delete files after processing, and store only the minimum structured data required by the user.

## Recommended production stack

- Frontend: Next.js
- Backend: FastAPI or Node.js workers
- OCR: AWS Textract for high accuracy, Tesseract for low-cost MVPs
- Database: PostgreSQL for structured transaction storage, Firebase for a fast beginner MVP
- Queue: Redis + BullMQ/Celery for large PDFs and OCR jobs
- Storage: encrypted S3 buckets with lifecycle deletion
- Auth: Firebase Auth, Auth.js, or Cognito

## Development

```bash
npm install
npm run dev
```

## Checks

```bash
npm run typecheck
npm run build
```
