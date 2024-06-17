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
  "C++", "C", "Kotlin", // Programming languages
  "software testing", "teamcenter", "dita xml" // Additional skills
];

// Helper function to normalize and tokenize text, ignoring common introductory phrases
function normalizeAndTokenize(text) {
  const regex = /^(how many years of work experience do you have with|how many years of do you have with|how many years of do you have)/i;
  const processedText = text.replace(regex, '');
  
  const tokenizer = new WordTokenizer();
  const tokens = tokenizer.tokenize(processedText.toLowerCase());
  return tokens.map(token => PorterStemmer.stem(token)).join(' ');
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

  saveAnswer(question, answer);
  return answer;
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

  if (answersDatabase.hasOwnProperty(question)) {
    return { mostSimilarQuestion: question, maxSimilarity: 1.0 };
  }
  
  let mostSimilarQuestion = null;
  let maxSimilarity = -1;

  for (const q of questions) {
    const dbContainsKeyword = keywords.some(keyword => q.toLowerCase().includes(keyword));
    
    if (dbContainsKeyword) {
      let similarity = calculateSimilarity(question, q);
      
      const inputContainsKeyword = keywords.some(keyword => question.toLowerCase().includes(keyword));

      if (inputContainsKeyword) {
        similarity *= 1.2;
      }

      if (similarity > maxSimilarity) {
        maxSimilarity = similarity;
        mostSimilarQuestion = q;
      }
    }
  }

  if (!mostSimilarQuestion) {
    for (const q of questions) {
      if (!keywords.some(keyword => q.toLowerCase().includes(keyword))) {
        let similarity = calculateSimilarity(question, q);

        if (similarity > maxSimilarity) {
          maxSimilarity = similarity;
          mostSimilarQuestion = q;
        }
      }
    }
  }

  if (maxSimilarity < 0.4) {
    return null;
  }

  return { mostSimilarQuestion, maxSimilarity };
}

module.exports = {
  answersDatabase,
  saveAnswer,
  handleNewQuestion,
  calculateSimilarity,
  getMostSimilarQuestion,
  normalizeAndTokenize
};
