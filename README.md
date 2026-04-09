# DECIDER: AI Resume Matcher & Job Analyzer (Google Sheets)

A Google Apps Script that automatically compares your CV against a job description using the Google Gemini API. Simply paste a job URL into your Google Sheet, and the AI will scrape the page, read your CV, and generate a match score, summary, and analysis in seconds.

## Features
* **Fully Automated:** Triggers automatically when you paste a link using `onEdit`.
* **Smart Web Scraping:** Bypasses basic bot protections and cleans messy HTML.
* **Custom UI Menu:** Easy setup for API keys directly inside Google Sheets without touching the code.
* **Structured AI Responses:** Uses Gemini's JSON mode to guarantee formatted outputs.
* **Custom Routing Rules:** Configure custom keywords to automatically exclude (score 0) or include specific job types (e.g., automatically reject unpaid internships).

## Setup Instructions

### 1. Prepare your Spreadsheet
Create a new Google Sheet and set up your columns exactly in this order:
* **A:** Date
* **B:** Job Type (Remote/Hybrid)
* **C:** Match Score
* **D:** Job Title
* **E:** AI Commentary / Status
* **F:** Summary
* **G:** Job URL *(Paste your links here!)*

### 2. Install the Script
1. In your Google Sheet, click on `Extensions` > `Apps Script`.
2. Delete any code in the editor and paste the entire contents of `Code.gs` from this repository.
3. Click the **Save** icon 💾.
4. Refresh your Google Sheet page.

### 3. Connect your API Key and CV
1. You should now see a new menu at the top of your Google Sheet called **🤖 AI CV Matcher**.
2. Click it, and select **⚙️ Setup API Key & CV Doc**.
3. It will ask you for two things:
   * **Google Doc CV ID:** Open your CV in Google Docs and copy the ID from the URL (the long string of letters and numbers between `/d/` and `/edit`). *Note: Ensure your script has permission to read this doc.*
   * **Gemini API Key:** Get a free API key from [Google AI Studio](https://aistudio.google.com/app/apikey).

## ⚙️ Configuration
Open the Apps Script editor to modify the `CONFIG` block at the top of the code. You can easily:
* Move the output columns around.
* Change the `INCLUDE_JOB_TYPES` and `EXCLUDE_JOB_TYPES` rules to fit your career goals.
* Adjust the Gemini model being used.

## 🛠️ Limitations
* Some job boards (like LinkedIn) have heavy JavaScript rendering and bot protection. If the script cannot read the page, it will return an error in Column E.
