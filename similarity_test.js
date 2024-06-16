const fs = require('fs');
const natural = require('natural');
const { TfIdf, WordTokenizer, PorterStemmer } = natural;
const readline = require('readline');

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
  "C++", "C" //Programming languages
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

// Function to handle new question and store answer
function handleNewQuestion(question) {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });

  rl.question(`Enter an answer for "${question}": `, (answer) => {
    answersDatabase[question] = answer;
    fs.writeFileSync(answersFilePath, JSON.stringify(answersDatabase, null, 2));
    rl.close();
  });
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
        console.log(`Question: "${q}", Similarity: ${similarity.toFixed(2)}, Input Contains Keywords: true, DB Contains Keywords: false`);

        if (similarity > maxSimilarity) {
          maxSimilarity = similarity;
          mostSimilarQuestion = q;
        }
      }
    }
  }

  // If no sufficiently similar question found, prompt for new answer
  if (maxSimilarity < 0.4) { // Adjust the threshold as needed based on your application
    handleNewQuestion(question);
    return null;
  }

  return { mostSimilarQuestion, maxSimilarity };
}

// Test input
const inputQuestion = 'How many years of work experience do you have with Teamcenter?';
const result = getMostSimilarQuestion(inputQuestion.trim());

if (result) {
  const { mostSimilarQuestion, maxSimilarity } = result;
  console.log(`Most similar question: "${mostSimilarQuestion}" with similarity score: ${maxSimilarity.toFixed(2)}`);
  console.log(`Answer: ${answersDatabase[mostSimilarQuestion]}`);
} else {
  console.log('No similar question found.');
}
