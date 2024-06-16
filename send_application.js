const { chromium } = require('playwright');
const fs = require('fs');
const natural = require('natural');
const readline = require('readline');
const { TfIdf, WordTokenizer, PorterStemmer } = natural;

// Load or initialize answers database
const answersFilePath = './answers.json';
let answersDatabase = {};

if (fs.existsSync(answersFilePath)) {
  const data = fs.readFileSync(answersFilePath, 'utf8');
  answersDatabase = JSON.parse(data);
} else {
  console.log('answers.json file not found. Please ensure it exists and is in the correct location.');
  process.exit(1);
}

// Array of keywords representing technologies or topics
const keywords = [
  "javascript", "typescript", "node.js", "react.js", "angular", "vue.js", // JavaScript Frameworks/Libraries
  "python", "django", "flask", // Python frameworks
  "java", "spring", "spring boot", // Java frameworks
  "aws", "azure", "google cloud", "cloud computing", // Cloud Platforms
  "docker", "kubernetes", "containerization", // DevOps and Containers
  "sql", "nosql", "mongodb", "postgresql", "mysql", "Databases",// Databases
  "git", "github", "gitlab", // Version Control (Git)
  "agile", "scrum", "kanban", // Agile Methodologies
  "machine learning", "deep learning", "artificial intelligence", "data science", // AI/ML and Data Science
  "html", "css", "sass", "bootstrap", "Web Development", // Web Technologies (HTML/CSS)
  "restful api", "graphql", // APIs and Architectures
  "microservices", "serverless", // Microservices and Serverless Architecture
  "devops", "continuous integration", "continuous deployment", // DevOps Practices
  "software engineering", "software development", "full stack", // Software Engineering and Full Stack
  "cybersecurity", "network security", // Cybersecurity
  "react native", "mobile development", // Mobile Development
  "blockchain", "ethereum", "smart contracts", // Blockchain
  "agile methodologies", "lean methodologies", // Agile and Lean Methodologies
  "big data", "apache spark", "hadoop", // Big Data
  "C++", "C", "Kotlin", // Programming languages
  "software testing", "teamcenter", "dita xml" // Additional skills
];

// Helper function to normalize and tokenize text, ignoring common introductory phrases
function normalizeAndTokenize(text) {
  // Remove common introductory phrases
  const regex = /^(how many years of work experience do you have with|how many years of do you have with|how many years of do you have)/i;
  const processedText = text.replace(regex, '');
  
  const tokenizer = new WordTokenizer();
  const tokens = tokenizer.tokenize(processedText.toLowerCase());
  return tokens.map(token => PorterStemmer.stem(token)).join(' ');
}

// Function to calculate cosine similarity using TF-IDF, adjusted for specific keywords
function calculateSimilarity(question1, question2) {
  const tfidf = new TfIdf();
  tfidf.addDocument(normalizeAndTokenize(question1));
  tfidf.addDocument(normalizeAndTokenize(question2));
  
  let similarity = 0;
  tfidf.listTerms(0).forEach(function(item) {
    const term = item.term;
    const tfidf1 = tfidf.tfidf(term, 0);
    const tfidf2 = tfidf.tfidf(term, 1);
    similarity += tfidf1 * tfidf2;
  });
  
  return similarity;
}

// Function to find the closest question based on TF-IDF similarity, prioritizing DB contains keywords
function getMostSimilarQuestion(question) {
  const questions = Object.keys(answersDatabase);
  if (questions.length === 0) return null;

  // Check for exact match first
  if (answersDatabase.hasOwnProperty(question)) {
    return { mostSimilarQuestion: question, maxSimilarity: 1.0 };
  }
  
  let mostSimilarQuestion = null;
  let maxSimilarity = -1;

  // Prioritize questions in DB that contain keywords
  for (const q of questions) {
    const dbContainsKeyword = keywords.some(keyword => q.toLowerCase().includes(keyword));
    
    if (dbContainsKeyword) {
      let similarity = calculateSimilarity(question, q);
      
      // Check if either the input question or database question contains keywords
      const inputContainsKeyword = keywords.some(keyword => question.toLowerCase().includes(keyword));

      // Adjust similarity based on presence of keywords
      if (inputContainsKeyword) {
        similarity *= 1.2; // Input question contains keywords
      }

      // Debugging: Log similarity and keywords for analysis
      console.log(`Question: "${q}", Similarity: ${similarity.toFixed(2)}, Input Contains Keywords: ${inputContainsKeyword}, DB Contains Keywords: true`);

      if (similarity > maxSimilarity) {
        maxSimilarity = similarity;
        mostSimilarQuestion = q;
      }
    }
  }

  // If no sufficiently similar question found among DB questions, compare with all questions
  if (!mostSimilarQuestion) {
    for (const q of questions) {
      if (!keywords.some(keyword => q.toLowerCase().includes(keyword))) {
        let similarity = calculateSimilarity(question, q);

        // Debugging: Log similarity for non-keyword-containing questions
        console.log(`Question: "${q}", Similarity: ${similarity.toFixed(2)}, Input Contains Keywords: false, DB Contains Keywords: false`);

        if (similarity > maxSimilarity) {
          maxSimilarity = similarity;
          mostSimilarQuestion = q;
        }
      }
    }
  }

  // If no sufficiently similar question found, prompt for new answer
  if (maxSimilarity < 0.4) { // Adjust the threshold as needed based on your application
    return null;
  }

  return { mostSimilarQuestion, maxSimilarity };
}

async function answerQuestions(page) {
  const questionElements = await page.$$('label.artdeco-text-input--label'); // Ensure you select the right labels
  for (let questionElement of questionElements) {
    const questionText = await questionElement.textContent();
    console.log("Question", questionText);
    // Find the corresponding input element using the 'for' attribute of the label
    const inputId = await questionElement.getAttribute('for');
    const answerElement = await page.$(`#${inputId}`);

    // Get the most similar question from the answers database
    const result = getMostSimilarQuestion(questionText.trim());
    let mostSimilarQuestion = null;
    let maxSimilarity = 0;

    if (result) {
      mostSimilarQuestion = result.mostSimilarQuestion;
      maxSimilarity = result.maxSimilarity;
    }

    let answer = null;
    if (mostSimilarQuestion && maxSimilarity > 0.7) {
      // Retrieve answer from the answers database
      answer = answersDatabase[mostSimilarQuestion];
    } else {
      // Handle new question
      answer = await handleNewQuestion(questionText.trim());
    }

    // Ensure the input element is present and fill it with the answer
    if (answerElement && answer !== null) {
      await answerElement.fill(answer);
    } else {
      console.log(`No answer found or no suitable question found for: "${questionText.trim()}".`);
    }
  }
}

function saveAnswer(question, answer) {
  answersDatabase[question] = answer;
  fs.writeFileSync(answersFilePath, JSON.stringify(answersDatabase, null, 2), 'utf8');
}

async function handleNewQuestion(question) {
  console.log(`No sufficiently similar question found for: "${question}". Please provide an answer.`);
  const answer = await new Promise((resolve) => {
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout
    });
    rl.question(`Answer for "${question}": `, (input) => {
      rl.close();
      resolve(input.trim());
    });
  });

  // Save the new answer to the database
  saveAnswer(question, answer);
  return answer;
}


















//###########################-----------MAIN FUNCTION----------###############################
(async () => {
  const browser = await chromium.launch({ headless: false });
  const context = await browser.newContext();
  const page = await context.newPage();
  
  await page.goto('https://www.linkedin.com/login');
  
  //-----------------------------------1.Login-----------------------------------------------
  //1.Auto Login
  await page.fill('input[name="session_key"]', 'wattsoneric1@gmail.com');
  await page.fill('input[name="session_password"]', 'Vishal.qsv123');
  await page.click('button[type="submit"]');
  
  //2.Maual Login
  console.log('Please log in to LinkedIn manually.');
  await page.waitForSelector('a.global-nav__primary-link--active', { timeout: 0 });  //Wait until the login is complete
  console.log('Login Sucessfull');
  
  //---------------------------2.Job Search-----------------------------------------------
  
  await page.goto('https://www.linkedin.com/jobs/');
  
  //1.JOB SEARCH KEYWORD
  //await page.fill('input[placeholder="Search by title, skill, or company"]', 'Software Engineer');
  //await page.click('button[data-control-name="job_search_button"]');
  
  await page.getByRole('combobox', { name: 'Search by title, skill, or' }).click();
  await page.waitForTimeout(3000)

  await page.getByRole('combobox', { name: 'Search by title, skill, or' }).fill('software');
  await page.getByRole('combobox', { name: 'Search by title, skill, or' }).press('Enter');
  await page.waitForTimeout(5000)

  //Select FILTERS
  //Select EASY APPLY FILTER BY DEFAULT
  await page.waitForSelector("//button[@aria-label='Easy Apply filter.']");
  //await page.click("//button[@aria-label='Easy Apply filter.']");
  
  console.log("Filter applied successfully ")
  
  await page.waitForTimeout(3000);
  
  //------------------------------------3.Apply JobS-----------------------------------------------
  
  //const jobListings = await page.$$('li[data-occludable-job-id]');
  //console.log(`Number of job listed: ${jobListings.length}`);
  const jobListings = await page.$$('//div[contains(@class,"display-flex job-card-container")]');
  console.log(`Number of job listed: ${jobListings.length}`);

  for (let job of jobListings) {
    console.log("inside loop");
    await job.click();
    
    //----------------------------------CASE 1: ALREADY APPLIED----------------
    /*const alreadyApplied = await page.$('li.job-card-container__footer-item.job-card-container__footer-job-state.t-bold');
    if (alreadyApplied) {
    console.log('Already applied to this job. Skipping.');
    continue;
    }*/ //failing
    
    //const easyApplyButton = await page.$('button[aria-label="Easy Apply"]');
    // Clicking the "Easy Apply" filter button/link
    //await page.getByLabel('Easy Apply filter.').click();
    //await page.click('button.jobs-apply-button');
    
    const alreadyApplied = await page.$('span.artdeco-inline-feedback__message:has-text("Applied")');
    if (alreadyApplied) { 
      console.log('Already applied to this job. Skipping.');
      continue;
    }
    
    //----------------------------------CASE 2: NOT EASY APPLY---------------
    const easyApplyButton = await page.waitForSelector('button.jobs-apply-button', { timeout: 5000 });

    if (!easyApplyButton) {
      console.log('No Easy Apply button found. Skipping this job.');
      continue;
    }
         

    //----------------------------------CASE 3: APPLYING NOW ------------------
    
    await easyApplyButton.click();   
    await page.waitForTimeout(3000)

    // Fill static data in default Template-1  
    //await page.fill('input[name="email"]', 'techin.1sight@gmail.com');
    //await page.fill('input[name="countryCode"]', '+91');
    //await page.fill('input[name="phone"]', '1234567890');
    
    await page.getByLabel('Email addressEmail address').selectOption('Select an option');
    await page.getByLabel('Email addressEmail address').selectOption('wattsoneric1@gmail.com');
    await page.getByLabel('Mobile phone number').fill('9390365005');

    await page.waitForTimeout(3000)

    await page.getByLabel('Continue to next step').click();

    //----------------Template-2
    await page.setInputFiles('input[type="file"]', 'Cashier Resume.pdf');
    
    await page.waitForTimeout(3000)
    await page.click('button:has-text("Next")');

    //----------------Template-3
    await page.waitForTimeout(5000)

    await answerQuestions(page);
    await page.click('button:has-text("Submit application")');

  }

  await browser.close();
})();
