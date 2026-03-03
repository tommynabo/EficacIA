import { Worker, Job } from 'bullmq';
import { config } from '../config/index.js';
import { LinkedInScraperService, AIMessageService, LinkedInDataService } from '../services/index.js';
import { sleep } from '../lib/utils.js';

export async function initWorkers() {
  const redisUrl = config.REDIS_URL;

  // Scraping Worker
  const scrapingWorker = new Worker(
    'scraping',
    async (job: Job) => {
      console.log(`Processing scraping job: ${job.id}`);
      
      const { campaignId, userId, searchUrl, linkedInAccountId, sessionCookie, maxLeads } = job.data;

      try {
        const scraper = new LinkedInScraperService();
        
        // Validate session first
        const isValid = await scraper.validateSession(sessionCookie);
        if (!isValid) {
          throw new Error('LinkedIn session is invalid or expired');
        }

        // Scrape profiles
        const { profiles, totalScraped } = await scraper.scrapeSearchResults(
          searchUrl,
          sessionCookie,
          maxLeads
        );

        // Save leads to database
        const leads = await LinkedInDataService.createLeads(
          campaignId,
          profiles.map(p => ({ linkedinProfileUrl: p.profileUrl }))
        );

        // Update campaign stats
        const campaign = await LinkedInDataService.getCampaignById(campaignId);
        if (campaign) {
          await LinkedInDataService.updateCampaign(campaignId, {
            leads_count: campaign.leads_count + leads.length,
            status: 'draft',
          });
        }

        // Enqueue analysis for each lead
        for (const lead of leads) {
          const profile = profiles.find(p => p.profileUrl === lead.linkedin_profile_url);
          if (profile) {
            // Will be processed by analysis worker
            await LinkedInDataService.updateLead(lead.id, {
              name: profile.name,
              title: profile.title,
              company: profile.company,
              bio: profile.bio,
              status: 'processing',
            });
          }
        }

        return {
          success: true,
          leadsScraped: totalScraped,
          campaignId,
        };
      } catch (error: any) {
        console.error('Scraping job error:', error);

        // Update campaign with error status
        await LinkedInDataService.updateCampaign(campaignId, {
          status: 'error',
        });

        throw new Error(`Scraping failed: ${error.message}`);
      }
    },
    { connection: { url: redisUrl } as any, concurrency: 1 }
  );

  // Send Message Worker
  const sendMessageWorker = new Worker(
    'send-message',
    async (job: Job) => {
      console.log(`Processing send message job: ${job.id}`);
      
      const { leadId, profileUrl, message, sessionCookie } = job.data;

      try {
        const scraper = new LinkedInScraperService();

        // Validate session
        const isValid = await scraper.validateSession(sessionCookie);
        if (!isValid) {
          throw new Error('Invalid LinkedIn session');
        }

        // Send connection request
        const success = await scraper.sendConnectionRequest(profileUrl, sessionCookie, message);

        // Update lead status
        await LinkedInDataService.updateLead(leadId, {
          status: success ? 'sent' : 'error',
          sent_at: success ? new Date().toISOString() : undefined,
          error_message: success ? undefined : 'Failed to send connection request',
        });

        // Log action
        const lead = await LinkedInDataService.updateLead(leadId, {});
        if (lead) {
          await LinkedInDataService.logAction({
            lead_id: leadId,
            campaign_id: lead.campaign_id,
            user_id: job.data.userId || 'unknown',
            action_type: 'send_message',
            status: success ? 'success' : 'error',
            error_details: success ? undefined : 'Failed to send message',
          });
        }

        return { success, leadId };
      } catch (error: any) {
        console.error('Send message job error:', error);

        // Update lead with error
        await LinkedInDataService.updateLead(leadId, {
          status: 'error',
          error_message: error.message,
        });

        throw new Error(`Send message failed: ${error.message}`);
      }
    },
    { connection: { url: redisUrl } as any, concurrency: 1 }
  );

  // Analyze Profile Worker
  const analyzeWorker = new Worker(
    'analyze-profile',
    async (job: Job) => {
      console.log(`Processing analyze profile job: ${job.id}`);
      
      const { leadId, name, title, company, bio, recentPost } = job.data;

      try {
        const analysis = await AIMessageService.analyzeProfile(
          name,
          title,
          company,
          bio,
          recentPost
        );

        const message = await AIMessageService.generateConnectionMessage(
          name,
          title,
          company,
          bio,
          recentPost
        );

        // Save AI message to lead
        await LinkedInDataService.updateLead(leadId, {
          ai_message: message,
          status: 'pending',
        });

        return {
          leadId,
          messageGenerated: true,
          analysis,
        };
      } catch (error: any) {
        console.error('Analyze job error:', error);
        throw new Error(`Analysis failed: ${error.message}`);
      }
    },
    { connection: { url: redisUrl } as any, concurrency: 3 }
  );

  // Event listeners
  scrapingWorker.on('completed', (job) => {
    console.log(`✓ Scraping completed: ${job.id}`);
  });

  scrapingWorker.on('failed', (job, error) => {
    console.error(`✗ Scraping failed: ${job?.id}`, error);
  });

  sendMessageWorker.on('completed', (job) => {
    console.log(`✓ Send message completed: ${job.id}`);
  });

  sendMessageWorker.on('failed', (job, error) => {
    console.error(`✗ Send message failed: ${job?.id}`, error);
  });

  analyzeWorker.on('completed', (job) => {
    console.log(`✓ Analysis completed: ${job.id}`);
  });

  analyzeWorker.on('failed', (job, error) => {
    console.error(`✗ Analysis failed: ${job?.id}`, error);
  });

  console.log('Workers initialized');

  return { scrapingWorker, sendMessageWorker, analyzeWorker };
}
