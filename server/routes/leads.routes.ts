import { Router, Request, Response } from 'express';
import { LinkedInDataService, AIMessageService } from '../services/index.js';
import { addSendMessageJob, addAnalyzeProfileJob } from '../services/queue.service.js';

const router = Router();

// Get leads by campaign
router.get('/campaigns/:campaignId/leads', async (req: Request, res: Response) => {
  try {
    const { campaignId } = req.params;
    const { status } = req.query;

    const leads = await LinkedInDataService.getLeads(
      campaignId,
      status as string | undefined
    );

    res.json(leads);
  } catch (error: any) {
    console.error('Get leads error:', error);
    res.status(500).json({
      error: 'Failed to fetch leads',
    });
  }
});

// Get single lead
router.get('/leads/:leadId', async (req: Request, res: Response) => {
  try {
    const { leadId } = req.params;

    const leads = await LinkedInDataService.getLeads(''); // We need to refactor this
    const lead = leads.find(l => l.id === leadId);

    if (!lead) {
      return res.status(404).json({ error: 'Lead not found' });
    }

    res.json(lead);
  } catch (error: any) {
    console.error('Get lead error:', error);
    res.status(500).json({
      error: 'Failed to fetch lead',
    });
  }
});

// Regenerate AI message for a lead
router.post('/leads/:leadId/regenerate-message', async (req: Request, res: Response) => {
  try {
    const { leadId } = req.params;

    // Get the lead (we'll need to refactor to get by ID directly)
    // For now, this is a placeholder
    const message = await AIMessageService.generateConnectionMessage(
      'Unknown',
      undefined,
      undefined,
      undefined,
      undefined
    );

    res.json({ message });
  } catch (error: any) {
    console.error('Regenerate message error:', error);
    res.status(500).json({
      error: 'Failed to regenerate message',
    });
  }
});

// Send message to a lead manually
router.post('/leads/:leadId/send', async (req: Request, res: Response) => {
  try {
    const userId = req.userId;
    const { leadId } = req.params;
    const { message, sessionCookie, profileUrl } = req.body;

    if (!userId || !message || !sessionCookie || !profileUrl) {
      return res.status(400).json({
        error: 'Message, session cookie, and profile URL are required',
      });
    }

    // Add job to queue
    const job = await addSendMessageJob({
      leadId,
      profileUrl,
      message,
      linkedInAccountId: '', // Get from campaign
      sessionCookie,
    });

    res.json({
      jobId: job.id,
      message: 'Message scheduled for sending',
      status: 'queued',
    });
  } catch (error: any) {
    console.error('Send lead error:', error);
    res.status(500).json({
      error: error.message || 'Failed to send message',
    });
  }
});

// Send all leads in campaign
router.post('/campaigns/:campaignId/send-all', async (req: Request, res: Response) => {
  try {
    const userId = req.userId;
    const { campaignId } = req.params;

    if (!userId) {
      return res.status(401).json({ error: 'Not authenticated' });
    }

    // Get campaign
    const campaign = await LinkedInDataService.getCampaignById(campaignId);
    if (!campaign) {
      return res.status(404).json({ error: 'Campaign not found' });
    }

    // Get pending leads
    const leads = await LinkedInDataService.getLeads(campaignId, 'pending');

    // Schedule each lead
    let scheduled = 0;
    for (const lead of leads) {
      if (!lead.ai_message) continue;

      try {
        await addSendMessageJob(
          {
            leadId: lead.id,
            profileUrl: lead.linkedin_profile_url,
            message: lead.ai_message,
            linkedInAccountId: campaign.linkedin_account_id,
            sessionCookie: '', // This should come from the account
          },
          scheduled * 3600000 // Space out by 1 hour
        );
        scheduled++;
      } catch (error) {
        console.error(`Failed to schedule lead ${lead.id}`, error);
      }
    }

    // Update campaign status
    await LinkedInDataService.updateCampaign(campaignId, {
      status: 'running',
    });

    res.json({
      message: 'Campaign started',
      leadsScheduled: scheduled,
      totalLeads: leads.length,
    });
  } catch (error: any) {
    console.error('Send all error:', error);
    res.status(500).json({
      error: error.message || 'Failed to send campaign',
    });
  }
});

// Pause campaign
router.post('/campaigns/:campaignId/pause', async (req: Request, res: Response) => {
  try {
    const { campaignId } = req.params;

    const campaign = await LinkedInDataService.updateCampaign(campaignId, {
      status: 'paused',
    });

    res.json({ campaign, message: 'Campaign paused' });
  } catch (error: any) {
    console.error('Pause campaign error:', error);
    res.status(500).json({
      error: 'Failed to pause campaign',
    });
  }
});

// Resume campaign
router.post('/campaigns/:campaignId/resume', async (req: Request, res: Response) => {
  try {
    const { campaignId } = req.params;

    const campaign = await LinkedInDataService.updateCampaign(campaignId, {
      status: 'running',
    });

    res.json({ campaign, message: 'Campaign resumed' });
  } catch (error: any) {
    console.error('Resume campaign error:', error);
    res.status(500).json({
      error: 'Failed to resume campaign',
    });
  }
});

export default router;
