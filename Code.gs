/**
 * 🤖 AI Resume Matcher & Job Analyzer
 * ---------------------------------------------------
 * This script automatically fetches a job description from a URL pasted into a Google Sheet,
 * compares it against a Google Doc CV using the Google Gemini API, and outputs a match score,
 * summary, and reasoning.
 * * GitHub Repository: 
 * Author: A. Duymaz 
 */

// ==========================================
// 1. GLOBAL CONFIGURATION
// ==========================================
// Users can easily adapt the script to their own layout and preferences by changing these values.
const CONFIG = {
  COLUMNS: {
    DATE: 1,          // Column A
    JOB_TYPE: 2,      // Column B (e.g., Remote, Hybrid)
    SCORE: 3,         // Column C (Match Score %)
    JOB_TITLE: 4,     // Column D
    AI_COMMENT: 5,    // Column E (Reasoning/Status Messages)
    SUMMARY: 6,       // Column F
    JOB_URL: 7        // Column G (Trigger column)
  },
  RULES: {
    // Customize what job types should be automatically rejected or explicitly accepted
    EXCLUDE_JOB_TYPES: "active student roles, unpaid internships, volunteer work, senior academic roles (Professor, PostDoc)",
    INCLUDE_JOB_TYPES: "Corporate roles, Industry positions, PhD Researcher, Doctoral Student"
  },
  SETTINGS: {
    HEADER_ROW: 1,               // Ignore edits on this row
    MAX_TEXT_LENGTH: 15000,      // Max chars to send to AI (to save tokens)
    MIN_TEXT_LENGTH: 200,        // Min chars required to consider a valid job post
    GEMINI_MODEL: "gemini-1.5-flash" // Recommended model for fast, cheap text processing
  },
  MESSAGES: {
    PROCESSING: "⏳ AI is analyzing the job and your CV...",
    ERR_CV_READ: "❌ Error: Could not read the CV document. Check Document ID.",
    ERR_FETCH: "❌ Error: Could not fetch text from the URL (Anti-bot protection or invalid link).",
    ERR_API: "❌ Error: API failed to respond or returned invalid data.",
    ERR_CRITICAL: "❌ Critical Error: "
  }
};

// ==========================================
// 2. UI & SETUP MENU
// ==========================================
/**
 * Creates a custom menu in Google Sheets for easy configuration.
 */
function onOpen() {
  let ui = SpreadsheetApp.getUi();
  ui.createMenu('🤖 AI CV Matcher')
    .addItem('⚙️ Setup API Key & CV Doc', 'setupCredentials')
    .addToUi();
}

/**
 * Prompts the user to securely save their API Key and Document ID.
 */
function setupCredentials() {
  let ui = SpreadsheetApp.getUi();
  let props = PropertiesService.getScriptProperties();
  
  let cvResponse = ui.prompt('Setup (1/2)', 'Enter your Google Doc CV ID:', ui.ButtonSet.OK_CANCEL);
  if (cvResponse.getSelectedButton() == ui.Button.OK) {
    props.setProperty("CV_DOC_ID", cvResponse.getResponseText().trim());
  }

  let apiResponse = ui.prompt('Setup (2/2)', 'Enter your Google Gemini API Key:', ui.ButtonSet.OK_CANCEL);
  if (apiResponse.getSelectedButton() == ui.Button.OK) {
    props.setProperty("GEMINI_API_KEY", apiResponse.getResponseText().trim());
    ui.alert('✅ Setup Complete! You can now paste links in the Job URL column.');
  }
}

// ==========================================
// 3. MAIN TRIGGER (ON EDIT)
// ==========================================
/**
 * Listens for edits in the Spreadsheet. Triggers only when a URL is pasted in the target column.
 */
function onEdit(e) {
  if (!e || !e.range) return; // Prevent errors if run manually from the editor

  let sheet = e.source.getActiveSheet();
  let range = e.range;
  let row = range.getRow();
  let col = range.getColumn();
  let url = e.value;

  // Validate: Must be the designated URL column, below the header, and not an empty deletion
  if (col !== CONFIG.COLUMNS.JOB_URL || row <= CONFIG.SETTINGS.HEADER_ROW || !url) return;
  
  // Basic URL validation
  if (!url.startsWith("http")) return;

  // Set processing status
  sheet.getRange(row, CONFIG.COLUMNS.AI_COMMENT).setValue(CONFIG.MESSAGES.PROCESSING);

  try {
    // 1. Retrieve Stored Credentials
    let scriptProps = PropertiesService.getScriptProperties();
    let cvDocId = scriptProps.getProperty("CV_DOC_ID");
    let apiKey = scriptProps.getProperty("GEMINI_API_KEY");

    if (!cvDocId || !apiKey) {
      sheet.getRange(row, CONFIG.COLUMNS.AI_COMMENT).setValue("❌ Error: Missing API Key or CV Doc ID. Use the custom menu to setup.");
      return;
    }

    // 2. Read the CV Document
    let cvText = "";
    try {
      cvText = DocumentApp.openById(cvDocId).getBody().getText();
    } catch (err) {
      sheet.getRange(row, CONFIG.COLUMNS.AI_COMMENT).setValue(CONFIG.MESSAGES.ERR_CV_READ);
      return;
    }

    // 3. Fetch and Clean Job Description HTML
    let jobText = fetchAndCleanHTML(url);
    if (jobText.length < CONFIG.SETTINGS.MIN_TEXT_LENGTH) {
      sheet.getRange(row, CONFIG.COLUMNS.AI_COMMENT).setValue(CONFIG.MESSAGES.ERR_FETCH);
      return;
    }

    // 4. Send to Gemini API for Analysis
    let aiAnalysis = evaluateWithGemini(cvText, jobText, apiKey);

    // 5. Output Results to Sheet
    if (aiAnalysis && aiAnalysis.score !== undefined) {
      let today = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), "dd/MM/yyyy HH:mm");
      
      sheet.getRange(row, CONFIG.COLUMNS.DATE).setValue(today);
      sheet.getRange(row, CONFIG.COLUMNS.JOB_TYPE).setValue(aiAnalysis.job_type || "Unknown");
      sheet.getRange(row, CONFIG.COLUMNS.SCORE).setValue(aiAnalysis.score + "%");
      sheet.getRange(row, CONFIG.COLUMNS.JOB_TITLE).setValue(aiAnalysis.job_title || "Not Found");
      sheet.getRange(row, CONFIG.COLUMNS.AI_COMMENT).setValue(aiAnalysis.comment || "No comment provided.");
      sheet.getRange(row, CONFIG.COLUMNS.SUMMARY).setValue(aiAnalysis.summary || "No summary provided.");
    } else {
      sheet.getRange(row, CONFIG.COLUMNS.AI_COMMENT).setValue(CONFIG.MESSAGES.ERR_API);
    }

  } catch (err) {
    sheet.getRange(row, CONFIG.COLUMNS.AI_COMMENT).setValue(CONFIG.MESSAGES.ERR_CRITICAL + err.message);
  }
}

// ==========================================
// 4. HELPER FUNCTIONS
// ==========================================

/**
 * Fetches HTML from a URL and strips it down to clean text.
 */
function fetchAndCleanHTML(url) {
  try {
    let options = {
      muteHttpExceptions: true,
      headers: {
        // Disguise as a standard browser to bypass basic anti-bot screens
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/114.0.0.0 Safari/537.36"
      }
    };
    
    let html = UrlFetchApp.fetch(url, options).getContentText();
    
    // Remove scripts, styles, and HTML tags
    let cleanText = html.replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
                        .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
                        .replace(/<[^>]+>/g, ' ')
                        .replace(/\s+/g, ' ') // Collapse multiple spaces
                        .trim();
                        
    return cleanText.substring(0, CONFIG.SETTINGS.MAX_TEXT_LENGTH);
  } catch (e) {
    return "";
  }
}

/**
 * Sends the CV and Job Description to the Gemini API and requests a structured JSON response.
 */
function evaluateWithGemini(cvText, jobText, apiKey) {
  let apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${CONFIG.SETTINGS.GEMINI_MODEL}:generateContent?key=${apiKey}`;
  
  let promptText = `
    You are an expert HR ATS AI and tech recruiter. I am going to provide you with my CV and a Job Description.
    Evaluate how well my CV matches the job requirements.

    CRITICAL RULE 1: If the job explicitly falls into any of these exclusion categories: [${CONFIG.RULES.EXCLUDE_JOB_TYPES}], you MUST assign a score of 0.
    CRITICAL RULE 2: Roles matching these inclusion categories: [${CONFIG.RULES.INCLUDE_JOB_TYPES}] ARE FULLY VALID. Do not assign them a 0 automatically. Evaluate and score them normally based on how well the candidate's skills match the requirements.

    Job Description:
    ---
    ${jobText}
    ---

    My CV:
    ---
    ${cvText}
    ---

    Analyze the match and return the result STRICTLY as a JSON object. Do not include markdown formatting or extra text outside the JSON. Use EXACTLY these five keys:
    {
      "job_title": "Extracted exact job title",
      "job_type": "Remote, Hybrid, or On-site",
      "score": Number from 0 to 100 based on skill match (Remember Critical Rules 1 & 2),
      "comment": "1-2 short sentences explaining why the score was given (missing skills vs matching skills)",
      "summary": "A brief 2 sentence summary of what the company does and what the role entails"
    }
  `;

  let payload = {
    "contents": [{
      "parts": [{"text": promptText}]
    }],
    "generationConfig": {
      "responseMimeType": "application/json"
    }
  };

  let options = {
    "method": "post",
    "contentType": "application/json",
    "payload": JSON.stringify(payload),
    "muteHttpExceptions": true
  };

  try {
    let response = UrlFetchApp.fetch(apiUrl, options);
    let json = JSON.parse(response.getContentText());
    
    if (json.candidates && json.candidates[0].content.parts[0].text) {
      let resultText = json.candidates[0].content.parts[0].text;
      return JSON.parse(resultText); // Parse the AI's JSON string
    }
    return null;
  } catch (e) {
    console.error("Gemini API Error: " + e.toString());
    return null;
  }
}
