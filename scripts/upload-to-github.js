import { getUncachableGitHubClient } from '../server/github-client.js';
import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';

const REPO_OWNER = 'manhx8pharma';
const REPO_NAME = 'DocumentCompiler';

async function uploadToGitHub() {
  try {
    console.log('🚀 Starting GitHub upload process...');
    
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
      console.log('✅ Repository exists:', repo.html_url);
    } catch (error) {
      if (error.status === 404) {
        console.log('📁 Creating new repository...');
        const { data } = await octokit.rest.repos.createForAuthenticatedUser({
          name: REPO_NAME,
          description: 'DocCompile - Document Generation System',
          private: false,
        });
        repo = data;
        console.log('✅ Repository created:', repo.html_url);
      } else {
        throw error;
      }
    }
    
    // Initialize git repository if not exists
    if (!fs.existsSync('.git')) {
      console.log('🔧 Initializing Git repository...');
      execSync('git init');
      execSync('git branch -M main');
    }
    
    // Create .gitignore if not exists
    const gitignorePath = '.gitignore';
    if (!fs.existsSync(gitignorePath)) {
      const gitignoreContent = `# Dependencies
node_modules/
npm-debug.log*
yarn-debug.log*
yarn-error.log*

# Production builds
dist/
build/

# Environment variables
.env
.env.local
.env.production

# Database
*.db
*.sqlite

# Logs
logs/
*.log

# Runtime data
pids/
*.pid
*.seed
*.pid.lock

# Coverage directory used by tools like istanbul
coverage/

# OS generated files
.DS_Store
.DS_Store?
._*
.Spotlight-V100
.Trashes
ehthumbs.db
Thumbs.db

# IDE files
.vscode/
.idea/
*.swp
*.swo

# Temporary files
tmp/
temp/
*.tmp

# Uploaded files (keep structure but not actual files in git)
storage/templates/*
!storage/templates/.gitkeep
storage/documents/*
!storage/documents/.gitkeep

# System files
*.zip
*.tar.gz
`;
      fs.writeFileSync(gitignorePath, gitignoreContent);
      console.log('📝 Created .gitignore file');
    }
    
    // Create storage directories with .gitkeep files
    const storageDirs = ['storage/templates', 'storage/documents'];
    storageDirs.forEach(dir => {
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      const gitkeepPath = path.join(dir, '.gitkeep');
      if (!fs.existsSync(gitkeepPath)) {
        fs.writeFileSync(gitkeepPath, '');
      }
    });
    
    // Add remote if not exists
    try {
      execSync('git remote get-url origin', { stdio: 'ignore' });
    } catch {
      console.log('🔗 Adding remote origin...');
      execSync(`git remote add origin ${repo.clone_url}`);
    }
    
    // Stage all files
    console.log('📦 Staging files...');
    execSync('git add .');
    
    // Commit changes
    try {
      execSync('git commit -m "Initial commit: DocCompile document generation system"');
      console.log('✅ Files committed');
    } catch (error) {
      console.log('ℹ️  No changes to commit or already committed');
    }
    
    // Push to GitHub
    console.log('⬆️  Pushing to GitHub...');
    try {
      execSync('git push -u origin main');
    } catch (error) {
      // If push fails due to existing content, force push
      console.log('🔄 Force pushing (repository might have existing content)...');
      execSync('git push -u origin main --force');
    }
    
    console.log('🎉 Successfully uploaded to GitHub!');
    console.log(`📍 Repository URL: ${repo.html_url}`);
    
  } catch (error) {
    console.error('❌ Error uploading to GitHub:', error.message);
    throw error;
  }
}

// Run the upload
uploadToGitHub().catch(console.error);