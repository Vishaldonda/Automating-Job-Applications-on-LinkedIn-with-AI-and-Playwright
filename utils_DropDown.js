const fs = require('fs');

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
module.exports = {
  answerDropDown,
  handleNewAnswerDropDown,
};
