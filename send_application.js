const { chromium } = require('playwright');
const readline = require('readline');
const fs = require('fs');
const { answersDatabase, saveAnswer, handleNewQuestion, calculateSimilarity, getMostSimilarQuestion, normalizeAndTokenize } = require('./utils_Numeric.js');
const { answerDropDown, handleNewAnswerDropDown } = require('./utils_DropDown');
const { answerBinaryQuestions, handleNewQuestionBinary} = require('./utils_Binary.js');


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


// -------------------RESPONSE HANDLER---------------

async function answerQuestions(page){
  await  answerNumericQuestions(page)
  await  answerBinaryQuestions(page)
  await answerDropDown(page)
}



async function handleNextOrReview(page) {
  let hasNextButton = true;

  while (hasNextButton) {
    try {
      const nextButton = await page.$('button[aria-label="Continue to next step"]');
      if (nextButton) {
        await nextButton.click();
        await page.waitForTimeout(3000); // Wait for the next step to load
        await answerQuestions(page);
      } else {
        hasNextButton = false; // No more "Next" buttons found
      }
    } catch (error) {
      hasNextButton = false; // Exit loop if any error occurs (e.g., button not found)
    }
  }

  // Handle the review step
  try {
    const reviewButton = await page.$('button[aria-label="Review your application"]');
    if (reviewButton) {
      await reviewButton.click();
      console.log("Review button successfully clicked");

      const submitButton = await page.$('button[aria-label="Submit application"]');
      if (submitButton) {
        await submitButton.click();
        console.log("Submit button clicked");

        await page.waitForTimeout(5000);
        await page.waitForSelector('button[aria-label="Dismiss"]', { visible: true });
        let modalButton = await page.$('button[aria-label="Dismiss"]');
        let attempts = 0;
        const maxAttempts = 10;

        while (attempts < maxAttempts) {
          try {
            await modalButton.evaluate(b => b.click());
            console.log("Dismiss button clicked");
            break; // Exit loop if click is successful
          } catch (error) {
            console.log(`Attempt ${attempts + 1} failed: ${error.message}`);
            attempts++;
            await page.waitForTimeout(500); // Wait before retrying
            modalButton = await page.$('button[aria-label="Dismiss"]'); // Re-select the button
          }
        }

        if (attempts === maxAttempts) {
          console.log("Failed to click the Dismiss button after multiple attempts.");
        }
      }
    }
  } catch (error) {
    console.log('Review button not found or failed to click:', error.message);
  }
}



//--------- Main assist Funtions--------------
async function fillPhoneNumber(page, phoneNumber) {
  try {
    let inputElement;

    // Try to fill "Mobile phone number"
    try {
      let labelName = "Mobile phone number";
      inputElement = await page.getByLabel(labelName, { exact: true });
      await inputElement.fill(phoneNumber);
      console.log(`Filled ${labelName} with ${phoneNumber}`);
      return; // Exit if successfully filled
    } catch (error) {
      console.log("Mobile phone number input field not found, trying Phone label.");
    }

    // If "Mobile phone number" not found, try "Phone"
    try {
      let labelName = "Phone";
      inputElement = await page.getByLabel(labelName, { exact: true });
      await inputElement.fill(phoneNumber);
      console.log(`Filled ${labelName} with ${phoneNumber}`);
    } catch (error) {
      console.log("Phone input field not found.");
    }

  } catch (error) {
    console.error("Error filling phone number:", error);
  }
}

async function getJobName(page) {
  try {
    // Use XPath to select the job name element
    const jobNameElement = await page.$('//h1[contains(@class,"t-24 t-bold")]//a[1]');
    if (jobNameElement) {
      const jobName = await jobNameElement.textContent();
      return jobName.trim();
    } else {
      return "Unknown Job"; // Fallback if job name is not found
    }
  } catch (error) {
    console.error("Error extracting job name:", error);
    return "Unknown Job";
  }
}



//###########################-----------MAIN FUNCTION----------###############################
(async () => {
  const browser = await chromium.launch({ headless: false });
 
  /*const browser = await chromium.launch({ 
    headless: false, 
    channel: 'chrome' // Use Chrome channel
  });*/
 
  const context = await browser.newContext();
  const page = await context.newPage();
  
  try{
  await page.goto('https://www.linkedin.com/login');
  
  //-----------------------------------1.Login-----------------------------------------------
  //1.Auto Login
  await page.fill('input[name="session_key"]', 'wattsoneric1@gmail.com');
  await page.fill('input[name="session_password"]', 'Vishal.qsv123');
  await page.click('button[type="submit"]');
  
  //2.Maual Login
  //console.log('Please log in to LinkedIn manually.');
  
  await page.waitForSelector('a.global-nav__primary-link--active', { timeout: 0 });  //Wait until the login is complete AND reaches Home Page
  console.log('Login was Sucessfull');
  
  //---------------------------2.Go to Job Search-----------------------------------------------
  
  await page.goto('https://www.linkedin.com/jobs/');
  
  //Action 1.JOB SEARCH KEYWORD
  
  await page.waitForTimeout(3000)
  await page.getByRole('combobox', { name: 'Search by title, skill, or' }).click();
  await page.waitForTimeout(3000)

  await page.getByRole('combobox', { name: 'Search by title, skill, or' }).fill('Data Engineer');
  await page.getByRole('combobox', { name: 'Search by title, skill, or' }).press('Enter');
  await page.waitForTimeout(5000)

  //Action 2.Select FILTERS
  //Select EASY APPLY FILTER BY DEFAULT
  await page.waitForSelector("//button[@aria-label='Easy Apply filter.']");
  await page.click("//button[@aria-label='Easy Apply filter.']");
  

  console.log("Filter applied successfully ")
  await page.waitForTimeout(3000);
  
  //------------------------------------3.Start Applying Jobs-----------------------------------------------
  
  let currentPage = 1;
  let jobCounter = 0;

  while (true) {
    console.log(`Navigating to page ${currentPage}`);

  const jobListings = await page.$$('//div[contains(@class,"display-flex job-card-container")]');
  console.log(`Number of job listed on page ${currentPage}: ${jobListings.length}`);

  if (jobListings.length === 0) {
    console.log(`No jobs found on page ${currentPage}. Exiting.`);
    break;
  }

  // Start applying jobs in Current Page
  for (let job of jobListings) {
    
    jobCounter++;
    console.log(`Processing job ${jobCounter} on page ${currentPage}`);
    await job.click();
    
    //----------------------------------CASE 1: ALREADY APPLIED----------------
    
    const alreadyApplied = await page.$('span.artdeco-inline-feedback__message:has-text("Applied")');
    if (alreadyApplied) { 
      const jobName = await getJobName(page);
      console.log(`Already applied to the job: ${jobName}. Skipping.`);
      continue;
    }
    
    //----------------------------------CASE 2: NOT EASY APPLY---------------
    
    let easyApplyButton

    try{
      easyApplyButton = await page.waitForSelector('button.jobs-apply-button', { timeout: 5000 });
      await easyApplyButton.click();
    }catch(error){
      console.log('No Easy Apply button found or failed to click. Skipping this job.');
      continue;
    }

    //----------------------------------CASE 3: APPLYING NOW ------------------
    
    await page.waitForTimeout(3000)

    // -------------- Fill the Static Data ------------------- 
 
    // 1.Check for both possible email labels and select the email address
    const emailLabel = await page.$('label:has-text("Email address")') || await page.$('label:has-text("Email")');
    if (emailLabel) {
      const emailInputId = await emailLabel.getAttribute('for');
      await page.selectOption(`#${emailInputId}`, 'wattsoneric1@gmail.com');
    }

    // 2.Attempt to select the phone country code from the dropdown
    try {
      const phoneCountryLabel = await page.$('label:has-text("Phone country code")');
      if (phoneCountryLabel) {
        const phoneCountryInputId = await phoneCountryLabel.getAttribute('for');
        await page.selectOption(`#${phoneCountryInputId}`, 'India (+91)');
      }
    } catch (error) {
      console.log('Phone country code dropdown not found:', error.message);
    }

    // 3.Check for both possible phone labels and fill in the phone number
    await fillPhoneNumber(page, '9390365005');

    // 4.Attach Resume
    //No need to attach resume every time its Auto Attached ; commented to reduce unnecessary WAIT
    /*try{
    await page.setInputFiles('input[type="file"]', 'Cashier Resume.pdf');
    }
    catch(error){
      continue;
    }*/

    await page.waitForTimeout(3000)

    //Handles all Templates Questions
    await answerQuestions(page);
    await handleNextOrReview(page) // recursive answers questions until it reaches review

  }// Move to the next page if available
  currentPage++;
  const nextPageButton = await page.$(`button[aria-label="Page ${currentPage}"]`);
  if (nextPageButton) {
    await nextPageButton.click();
    await page.waitForTimeout(5000); // Adjust wait time as needed
    console.log(`Navigated to page ${currentPage}`);
  } else {
    console.log(`No more pages found. Exiting.`);
    break;
  }
}
}catch (error) {
  console.error("Script error:", error);
} finally {
  await browser.close();
}
})();
