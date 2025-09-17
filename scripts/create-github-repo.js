import { getUncachableGitHubClient } from '../server/github-client.js';

const REPO_OWNER = 'manhx8pharma';
const REPO_NAME = 'DocumentCompiler';

async function createGitHubRepo() {
  try {
    console.log('🚀 Checking GitHub repository...');
    
    // Get GitHub client
    const octokit = await getUncachableGitHubClient();
    
    // Check if repository exists, create if it doesn't
    let repo;
    try {
      const { data } = await octokit.rest.repos.get({
        owner: REPO_OWNER,
        repo: REPO_NAME,
      });
      repo = data;
      console.log('✅ Repository already exists:', repo.html_url);
    } catch (error) {
      if (error.status === 404) {
        console.log('📁 Creating new repository...');
        const { data } = await octokit.rest.repos.createForAuthenticatedUser({
          name: REPO_NAME,
          description: 'DocCompile - Document Generation System built with React, Node.js, and PostgreSQL',
          private: false,
        });
        repo = data;
        console.log('✅ Repository created:', repo.html_url);
      } else {
        throw error;
      }
    }
    
    console.log(`📍 Repository URL: ${repo.html_url}`);
    console.log(`📍 Clone URL: ${repo.clone_url}`);
    return repo;
    
  } catch (error) {
    console.error('❌ Error with GitHub repository:', error.message);
    throw error;
  }
}

// Run the repo creation
createGitHubRepo().catch(console.error);