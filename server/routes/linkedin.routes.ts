import { Router, Request, Response } from 'express';
import { LinkedInDataService, LinkedInScraperService } from '../services/index.js';
import {
  addScrapingJob,
  addAnalyzeProfileJob,
} from '../services/queue.service.js';

const router = Router();

// LinkedIn Accounts
router.post('/accounts', async (req: Request, res: Response) => {
  try {
    const userId = req.userId;
    const { sessionCookie, proxyIp } = req.body;

    if (!userId || !sessionCookie) {
      return res.status(400).json({
        error: 'Session cookie is required',
      });
    }

    // Validate session
    const scraper = new LinkedInScraperService();
    const isValid = await scraper.validateSession(sessionCookie);

    if (!isValid) {
      return res.status(400).json({
        error: 'Invalid LinkedIn session. Please provide a valid session cookie.',
      });
    }

    const account = await LinkedInDataService.createLinkedInAccount(
      userId,
      sessionCookie,
      proxyIp
    );

    res.json(account);
  } catch (error: any) {
    console.error('Create account error:', error);
    res.status(500).json({
      error: error.message || 'Failed to create account',
    });
  }
});

router.get('/accounts', async (req: Request, res: Response) => {
  try {
    const userId = req.userId;

    if (!userId) {
      return res.status(401).json({ error: 'Not authenticated' });
    }

    const accounts = await LinkedInDataService.getLinkedInAccounts(userId);

    res.json(accounts);
  } catch (error: any) {
    console.error('Get accounts error:', error);
    res.status(500).json({
      error: 'Failed to fetch accounts',
    });
  }
});

// Campaigns
router.post('/campaigns', async (req: Request, res: Response) => {
  try {
    const userId = req.userId;
    const { name, linkedInAccountId, settings } = req.body;

    if (!userId || !name || !linkedInAccountId) {
      return res.status(400).json({
        error: 'Name and linkedInAccountId are required',
      });
    }

    const campaign = await LinkedInDataService.createCampaign(
      userId,
      name,
      linkedInAccountId,
      settings
    );

    res.json(campaign);
  } catch (error: any) {
    console.error('Create campaign error:', error);
    res.status(500).json({
      error: error.message || 'Failed to create campaign',
    });
  }
});

router.get('/campaigns', async (req: Request, res: Response) => {
  try {
    const userId = req.userId;

    if (!userId) {
      return res.status(401).json({ error: 'Not authenticated' });
    }

    const campaigns = await LinkedInDataService.getCampaigns(userId);

    res.json(campaigns);
  } catch (error: any) {
    console.error('Get campaigns error:', error);
    res.status(500).json({
      error: 'Failed to fetch campaigns',
    });
  }
});

router.get('/campaigns/:campaignId', async (req: Request, res: Response) => {
  try {
    const { campaignId } = req.params;

    const campaign = await LinkedInDataService.getCampaignById(campaignId);

    if (!campaign) {
      return res.status(404).json({ error: 'Campaign not found' });
    }

    res.json(campaign);
  } catch (error: any) {
    console.error('Get campaign error:', error);
    res.status(500).json({
      error: 'Failed to fetch campaign',
    });
  }
});

router.put('/campaigns/:campaignId', async (req: Request, res: Response) => {
  try {
    const { campaignId } = req.params;
    const updates = req.body;

    const campaign = await LinkedInDataService.updateCampaign(campaignId, updates);

    res.json(campaign);
  } catch (error: any) {
    console.error('Update campaign error:', error);
    res.status(500).json({
      error: error.message || 'Failed to update campaign',
    });
  }
});

// Scrape search URL
router.post('/campaigns/:campaignId/scrape', async (req: Request, res: Response) => {
  try {
    const userId = req.userId;
    const { campaignId } = req.params;
    const { searchUrl, maxLeads } = req.body;

    if (!userId || !searchUrl) {
      return res.status(400).json({
        error: 'Search URL is required',
      });
    }

    const campaign = await LinkedInDataService.getCampaignById(campaignId);

    if (!campaign) {
      return res.status(404).json({ error: 'Campaign not found' });
    }

    if (campaign.user_id !== userId) {
      return res.status(403).json({ error: 'Unauthorized' });
    }

    // Get LinkedIn account
    const accounts = await LinkedInDataService.getLinkedInAccounts(userId);
    const account = accounts.find(a => a.id === campaign.linkedin_account_id);

    if (!account) {
      return res.status(400).json({
        error: 'LinkedIn account not configured',
      });
    }

    // Add scraping job to queue
    const job = await addScrapingJob({
      campaignId,
      userId,
      searchUrl,
      linkedInAccountId: account.id,
      sessionCookie: account.session_cookie,
      maxLeads: maxLeads || 50,
    });

    // Update campaign status
    await LinkedInDataService.updateCampaign(campaignId, {
      status: 'running',
    });

    res.json({
      jobId: job.id,
      message: 'Scraping started',
      status: 'processing',
    });
  } catch (error: any) {
    console.error('Scrape error:', error);
    res.status(500).json({
      error: error.message || 'Failed to start scraping',
    });
  }
});

export default router;
