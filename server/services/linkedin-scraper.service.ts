import { chromium, BrowserContext } from 'playwright';
import { config } from '../config/index.js';
import { sleep } from '../lib/utils.js';
import { supabase } from '../lib/supabase.js';

interface ProfileData {
  name?: string;
  title?: string;
  company?: string;
  bio?: string;
  recentPost?: string;
  profileUrl: string;
}

export class LinkedInScraperService {
  private context?: BrowserContext;

  async initContext(sessionCookie: string) {
    try {
      const browser = await chromium.launch({
        headless: true,
      });

      this.context = await browser.newContext({
        userAgent:
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
      });

      // Add session cookie
      await this.context.addCookies([
        {
          name: 'li_at',
          value: sessionCookie,
          domain: '.linkedin.com',
          path: '/',
          httpOnly: true,
          secure: true,
          sameSite: 'Lax',
          expires: Math.floor(Date.now() / 1000) + 86400 * 30, // 30 days
        },
      ]);

      return this.context;
    } catch (error: any) {
      throw new Error(`Failed to initialize browser context: ${error.message}`);
    }
  }

  async validateSession(sessionCookie: string): Promise<boolean> {
    const context = await this.initContext(sessionCookie);
    const page = await context.newPage();

    try {
      await page.goto(config.LINKEDIN_SESSION_VALIDATION_ENDPOINT, {
        waitUntil: 'load',
        timeout: config.PLAYWRIGHT_TIMEOUT,
      });

      // Check if redirected to login (means session is invalid)
      const url = page.url();
      const isValid = !url.includes('/login') && !url.includes('/checkpoint');

      return isValid;
    } catch (error) {
      return false;
    } finally {
      await page.close();
      await context.close();
    }
  }

  async scrapeSearchResults(
    searchUrl: string,
    sessionCookie: string,
    maxProfiles: number = 50
  ): Promise<{ profiles: ProfileData[], totalScraped: number }> {
    const context = await this.initContext(sessionCookie);
    const page = await context.newPage();
    const profiles: ProfileData[] = [];

    try {
      // Navigate to search results
      await page.goto(searchUrl, {
        waitUntil: 'networkidle',
        timeout: config.PLAYWRIGHT_TIMEOUT,
      });

      await sleep(2000); // Wait for results to load

      // Get all profile links
      const profileLinks = await page.locator('a[href*="/in/"]').all();
      const uniqueUrls = new Set<string>();

      for (const link of profileLinks) {
        if (uniqueUrls.size >= maxProfiles) break;

        try {
          const href = await link.getAttribute('href');
          if (href && href.includes('/in/')) {
            uniqueUrls.add(`https://linkedin.com${href}`);
          }
        } catch (error) {
          // Skip if can't extract href
          continue;
        }
      }

      // Scrape each profile
      for (const profileUrl of uniqueUrls) {
        if (profiles.length >= maxProfiles) break;

        try {
          const profileData = await this.scrapeProfile(page, profileUrl);
          if (profileData) {
            profiles.push(profileData);
          }

          await sleep(2000 + Math.random() * 3000); // Random delay between profiles
        } catch (error) {
          console.error(`Error scraping profile ${profileUrl}:`, error);
          continue;
        }
      }

      return {
        profiles,
        totalScraped: profiles.length,
      };
    } catch (error: any) {
      throw new Error(`Search scraping failed: ${error.message}`);
    } finally {
      await page.close();
      await context.close();
    }
  }

  private async scrapeProfile(page: any, profileUrl: string): Promise<ProfileData | null> {
    try {
      await page.goto(profileUrl, {
        waitUntil: 'load',
        timeout: config.PLAYWRIGHT_TIMEOUT,
      });

      // Extract profile information
      const name = await page
        .locator('h1[data-test-id="top-card-name"]')
        .textContent()
        .catch(() => null);

      const title = await page
        .locator('[data-test-id="top-card-headline"]')
        .textContent()
        .catch(() => null);

      const company = await page
        .locator('a[data-test-id="current-company-link"]')
        .textContent()
        .catch(() => null);

      // Get "About" section
      const bio = await page
        .locator('[data-test-id="about"]')
        .locator('.. >> text=/./') // Get first text node after About
        .textContent()
        .catch(() => null);

      // Get recent activity (posts)
      const recentPost = await page
        .locator('[data-test-id="feed-item"]')
        .first()
        .textContent()
        .catch(() => null);

      return {
        name: name?.trim() || undefined,
        title: title?.trim() || undefined,
        company: company?.trim() || undefined,
        bio: bio?.trim() || undefined,
        recentPost: recentPost?.trim().substring(0, 500) || undefined,
        profileUrl,
      };
    } catch (error) {
      console.error(`Profile scrape error for ${profileUrl}:`, error);
      return null;
    }
  }

  async sendConnectionRequest(
    profileUrl: string,
    sessionCookie: string,
    message?: string
  ): Promise<boolean> {
    const context = await this.initContext(sessionCookie);
    const page = await context.newPage();

    try {
      await page.goto(profileUrl, {
        waitUntil: 'load',
        timeout: config.PLAYWRIGHT_TIMEOUT,
      });

      // Look for "Connect" button
      const connectButton = await page
        .locator('button')
        .filter({ hasText: /Connect|Conectar/ })
        .first();
      
      const isVisible = await connectButton.isVisible().catch(() => false);

      if (!isVisible) {
        return false;
      }

      // Click connect button
      await page.locator('button').filter({ hasText: /Connect|Conectar/ }).first().click();
      await sleep(1000);

      // If message provided, fill in the message
      if (message) {
        try {
          const messageInput = page
            .locator('[placeholder*="message" i]')
            .or(page.locator('[aria-label*="message" i]'))
            .first();
          
          const isVisible = await messageInput.isVisible().catch(() => false);

          if (isVisible) {
            await messageInput.fill(message);
            await sleep(500);
          }
        } catch (error) {
          console.error('Error filling message:', error);
        }
      }

      // Send request
      try {
        const sendButton = page
          .locator('button')
          .filter({ hasText: /Send|Send now|Enviar/ })
          .first();
        
        const isVisible = await sendButton.isVisible().catch(() => false);

        if (isVisible) {
          await sendButton.click();
          await sleep(2000);
          return true;
        }
      } catch (error) {
        console.error('Error sending connection request:', error);
      }

      return false;
    } catch (error: any) {
      console.error(`Connection request failed: ${error.message}`);
      return false;
    } finally {
      await page.close();
      await context.close();
    }
  }

  async takeScreenshot(profileUrl: string, sessionCookie: string): Promise<Buffer | null> {
    const context = await this.initContext(sessionCookie);
    const page = await context.newPage();

    try {
      await page.goto(profileUrl, {
        waitUntil: 'load',
        timeout: config.PLAYWRIGHT_TIMEOUT,
      });

      const screenshot = await page.screenshot();
      return screenshot;
    } catch (error) {
      return null;
    } finally {
      await page.close();
      await context.close();
    }
  }
}
