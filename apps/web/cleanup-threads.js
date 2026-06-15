const { PrismaClient } = require('@prisma/client');

async function cleanupThreadsAccounts() {
  const prisma = new PrismaClient();
  
  try {
    // Find all Threads accounts for debugging
    const threadsAccounts = await prisma.socialAccount.findMany({
      where: { platform: 'THREADS' },
      select: {
        id: true,
        userId: true,
        username: true,
        platformUserId: true,
        accessToken: true,
        expiresAt: true,
        createdAt: true,
        updatedAt: true,
        lastSyncStatus: true,
        lastSyncError: true
      }
    });
    
    console.log('Found Threads accounts:');
    threadsAccounts.forEach((account, index) => {
      console.log(`${index + 1}. ID: ${account.id}`);
      console.log(`   Username: ${account.username}`);
      console.log(`   Platform User ID: ${account.platformUserId}`);
      console.log(`   Has Access Token: ${account.accessToken ? 'Yes' : 'No'}`);
      console.log(`   Token Length: ${account.accessToken?.length || 0}`);
      console.log(`   Expires At: ${account.expiresAt}`);
      console.log(`   Last Sync Status: ${account.lastSyncStatus}`);
      console.log(`   Last Sync Error: ${account.lastSyncError}`);
      console.log(`   Created: ${account.createdAt}`);
      console.log(`   Updated: ${account.updatedAt}`);
      console.log('---');
    });
    
    if (process.argv[2] === '--delete-all') {
      console.log('Deleting all Threads accounts...');
      const deleted = await prisma.socialAccount.deleteMany({
        where: { platform: 'THREADS' }
      });
      console.log(`Deleted ${deleted.count} Threads accounts.`);
    }
    
  } catch (error) {
    console.error('Error:', error);
  } finally {
    await prisma.$disconnect();
  }
}

cleanupThreadsAccounts();