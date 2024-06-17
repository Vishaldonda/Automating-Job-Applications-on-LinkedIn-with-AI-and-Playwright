const { chromium } = require('playwright');
const readline = require('readline');
const fs = require('fs');
const {
  answersDatabase,
  saveAnswer,
  handleNewQuestion,
  calculateSimilarity,
  getMostSimilarQuestion,
  normalizeAndTokenize
} = require('./utils');

//------------------------------------------------1.Numeric response HANDLER-------------------------

async function answerNumericQuestions(page) {
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

//-------------------------------------------------2.Binary response HANDLER-------------------------
const binaryAnswersFilePath  = './binary_response.json';
let binaryAnswersDatabase  = {};
if (fs.existsSync(binaryAnswersFilePath)) {
  const data = fs.readFileSync(binaryAnswersFilePath, 'utf8');
  binaryAnswersDatabase = JSON.parse(data);
} else {
  console.log('binary_response.json file not found. Creating a new one.');
  fs.writeFileSync(binaryAnswersFilePath, JSON.stringify(binaryAnswersDatabase, null, 2));
}

async function answerBinaryQuestions(page) {
  const binaryQuestionSelectors = [
    'fieldset[data-test-form-builder-radio-button-form-component="true"]',
  ];

  for (let selector of binaryQuestionSelectors) {
    const questionElements = await page.$$(selector);
    for (let questionElement of questionElements) {
      const questionTextElement = await questionElement.$('span[data-test-form-builder-radio-button-form-component__title]');
      const questionText = (await questionTextElement.textContent()).trim();
      console.log("Binary Question:", questionText);

      let answer = binaryAnswersDatabase[questionText];

      if (!answer) {
        answer = await handleNewQuestionBinary(questionText, page);
        binaryAnswersDatabase[questionText] = answer;
        fs.writeFileSync(binaryAnswersFilePath, JSON.stringify(binaryAnswersDatabase, null, 2));
      }

      const yesInput = await questionElement.$('input[value="Yes"]');
      const noInput = await questionElement.$('input[value="No"]');

      try {
        if (answer === 'Yes' && yesInput) {
          await yesInput.scrollIntoViewIfNeeded();
          await yesInput.click({ force: true });
        } else if (answer === 'No' && noInput) {
          await noInput.scrollIntoViewIfNeeded();
          await noInput.click({ force: true });
        } else {
          console.log(`No suitable answer found for: "${questionText}". Skipping.`);
        }
      } catch (error) {
        console.error(`Failed to click on the answer for: "${questionText}". Error: ${error}`);
      }
    }
  }
}

async function handleNewQuestionBinary(questionText, page) {
  let answer = '';

  while (answer !== 'Yes' && answer !== 'No') {
    answer = await new Promise((resolve) => {
      setTimeout(resolve, 1000);  // Wait for 1 second before checking again
    });

    const yesInput = await page.$('input[value="Yes"]:checked');
    const noInput = await page.$('input[value="No"]:checked');

    if (yesInput) {
      return 'Yes';
    } else if (noInput) {
      return 'No';
    } else {
      console.log('No selection made via UI. Please provide "Yes" or "No" via terminal.');
    }
  }

  return answer.charAt(0).toUpperCase() + answer.slice(1);
}

//-------------------------------------------------3.DropDown response HANDLER-------------------------
const dropdownAnswersFilePath = './dropdown_response.json';
let dropdownAnswersDatabase = {};
if (fs.existsSync(dropdownAnswersFilePath)) {
  const data = fs.readFileSync(dropdownAnswersFilePath, 'utf8');
  dropdownAnswersDatabase = JSON.parse(data);
} else {
  console.log('dropdown_response.json file not found. Creating a new one.');
  fs.writeFileSync(dropdownAnswersFilePath, JSON.stringify(dropdownAnswersDatabase, null, 2));
}

async function answerDropDown(page) {
  const dropdownQuestionSelector = 'div[data-test-text-entity-list-form-component]';

  const dropdownElements = await page.$$(dropdownQuestionSelector);
  for (let dropdownElement of dropdownElements) {
    const questionTextElement = await dropdownElement.$('label span:not(.visually-hidden)');
    const questionText = (await questionTextElement.textContent()).trim();
    console.log("Dropdown Question:", questionText);

    const selectElement = await dropdownElement.$('select');
    const options = await selectElement.$$('option');

    let answer = dropdownAnswersDatabase[questionText];

    if (!answer) {
      console.log(`Please select the answer for "${questionText}" via the browser UI.`);
      await selectElement.focus();

      // Polling loop to wait for user selection
      let selectedValue = await selectElement.inputValue();
      while (selectedValue === "Select an option") {
        await page.waitForTimeout(500);  // Wait for 500ms
        selectedValue = await selectElement.inputValue();
      }

      answer = selectedValue;
      dropdownAnswersDatabase[questionText] = answer;

      fs.writeFileSync(dropdownAnswersFilePath, JSON.stringify(dropdownAnswersDatabase, null, 2));
    } else {
      await selectElement.selectOption({ label: answer });
    }
  }
}


async function handleNewAnswerDropDown(questionText, page) {
  let answer = '';

  while (!answer) {
    answer = await new Promise((resolve) => {
      setTimeout(resolve, 1000);  // Wait for 1 second before checking again
    });

    const dropdownElement = await page.$('select:checked');
    if (dropdownElement) {
      const selectedOption = await dropdownElement.$('option:checked');
      answer = await selectedOption.textContent();
      return answer;
    } else {
      console.log('No selection made via UI. Please provide the dropdown answer via terminal.');
    }
  }

  return answer;
}

async function answerQuestions(page){
  await  answerNumericQuestions(page)
  await  answerBinaryQuestions(page)
  await answerDropDown(page)
}

async function handleNextOrReview(page) {
  let nextButton = await page.$('button[aria-label="Continue to next step"]');
  let reviewButton = await page.$('button[aria-label="Review your application"]');

  while (nextButton) {
    await nextButton.click();
    await page.waitForNavigation({ waitUntil: 'load' });
    await answerQuestions(page);
    nextButton = await page.$('button[aria-label="Continue to next step"]');
  }

  if (reviewButton) {
    await reviewButton.click();
    console.log("Review button successfully clicked");

    let submitButton = await page.$('button[aria-label="Submit application"]');
    if (submitButton) {
      await submitButton.click();
      console.log("Submit button clicked");

      await page.waitForTimeout(5000)
      await page.waitForSelector('button[aria-label="Dismiss"]', { visible: true });
      let modalButton = await page.$('button[aria-label="Dismiss"]');
      let attempts = 0;
      const maxAttempts = 10;

      while (attempts < maxAttempts) {
        try {
          await modalButton.evaluate(b => b.click());
          console.log("Modal button clicked");
          break; // Exit loop if click is successful
        } catch (error) {
          console.log(`Attempt ${attempts + 1} failed: ${error.message}`);
          attempts++;
          await page.waitForTimeout(500); // Wait before retrying
          modalButton = await page.$('button[aria-label="Dismiss"]'); // Re-select the button
        }
      }

      if (attempts === maxAttempts) {
        console.log("Failed to click the modal button after multiple attempts.");
      }
    }
  }
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
  
  await page.waitForTimeout(3000)
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
    await page.setInputFiles('input[type="file"]', 'Donda Vishal Resume.pdf');
    
    await page.waitForTimeout(3000)
    await page.click('button:has-text("Next")');

    //----------------Template-3
    await page.waitForTimeout(5000)

    await answerQuestions(page);
    await handleNextOrReview(page);
    
    //await page.click('button:has-text("Submit application")');

  }

  await browser.close();
})();
