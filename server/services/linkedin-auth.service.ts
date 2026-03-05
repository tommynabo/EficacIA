import { chromium, Browser, Page } from 'playwright'

/**
 * Servicio de autenticación LinkedIn usando Playwright
 * Permite login real con email + password y obtener session cookie válida
 */

export class LinkedInAuthService {
  private browser: Browser | null = null
  private timeout = 30000 // 30 segundos timeout

  /**
   * Autentica con LinkedIn y retorna la cookie de sesión válida
   * @param email Email de LinkedIn
   * @param password Contraseña de LinkedIn
   * @returns Cookie li_at válida o null si falla
   */
  async authenticateAndGetSession(email: string, password: string): Promise<string | null> {
    let page: Page | null = null

    try {
      console.log('[LINKEDIN_AUTH] Iniciando navegador para LinkedIn')

      // Inicia navegador en modo headless
      this.browser = await chromium.launch({
        headless: true,
      })

      page = await this.browser.newPage()

      // Navega a LinkedIn login
      console.log('[LINKEDIN_AUTH] Navegando a LinkedIn...')
      await page.goto('https://www.linkedin.com/login', {
        waitUntil: 'networkidle',
        timeout: this.timeout,
      })

      // Rellena email
      console.log('[LINKEDIN_AUTH] Ingresando email...')
      await page.fill('input[name="session_key"]', email, {
        timeout: this.timeout,
      })

      // Rellena contraseña
      console.log('[LINKEDIN_AUTH] Ingresando contraseña...')
      await page.fill('input[name="session_password"]', password, {
        timeout: this.timeout,
      })

      // Click login
      console.log('[LINKEDIN_AUTH] Haciendo click en login...')
      await page.click('button[type="submit"]', {
        timeout: this.timeout,
      })

      // Espera a que se complete el login (puede redirigir o mostrar challenge)
      console.log('[LINKEDIN_AUTH] Esperando respuesta del login...')

      // Espera a que termine de cargar (máximo 10 segundos)
      try {
        await page.waitForNavigation({
          waitUntil: 'networkidle',
          timeout: 10000,
        })
      } catch (e) {
        // Timeout es normal, continuamos
        console.log('[LINKEDIN_AUTH] Wait for navigation timeout (esperado)')
      }

      // Intenta obtener la cookie li_at
      console.log('[LINKEDIN_AUTH] Extrayendo cookie li_at...')
      const cookies = await page.context().cookies()
      const liAtCookie = cookies.find((c) => c.name === 'li_at')

      if (liAtCookie && liAtCookie.value) {
        console.log('[LINKEDIN_AUTH] ✓ Cookie obtenida exitosamente')

        // Valida que la cookie sea válida haciendo un request
        const isValid = await this.validateSessionCookie(liAtCookie.value)
        if (isValid) {
          console.log('[LINKEDIN_AUTH] ✓ Cookie validada contra LinkedIn API')
          return liAtCookie.value
        } else {
          console.log('[LINKEDIN_AUTH] ⚠️ Cookie obtenida pero validación falló')
          return null
        }
      } else {
        console.log('[LINKEDIN_AUTH] ⚠️ Cookie li_at no encontrada')
        console.log('[LINKEDIN_AUTH] Cookies disponibles:', cookies.map((c) => c.name))

        // Si hay un CAPTCHA o challenge, informar
        const pageContent = await page.content()
        if (pageContent.includes('challenge') || pageContent.includes('captcha')) {
          console.log('[LINKEDIN_AUTH] ⚠️ LinkedIn solicitó verificación adicional (CAPTCHA o desafío)')
          return null
        }

        return null
      }
    } catch (error) {
      console.error('[LINKEDIN_AUTH] Error en autenticación:', error)
      return null
    } finally {
      // Limpia el navegador
      if (page) {
        try {
          await page.close()
        } catch (e) {
          console.error('[LINKEDIN_AUTH] Error cerrando página:', e)
        }
      }

      if (this.browser) {
        try {
          await this.browser.close()
        } catch (e) {
          console.error('[LINKEDIN_AUTH] Error cerrando navegador:', e)
        }
      }
    }
  }

  /**
   * Valida que una cookie sea válida haciendo un request a LinkedIn API
   */
  private async validateSessionCookie(cookie: string): Promise<boolean> {
    try {
      const response = await fetch('https://www.linkedin.com/voyager/api/me', {
        headers: {
          'cookie': `li_at=${cookie}`,
          'User-Agent':
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        },
      })

      return response.status === 200
    } catch (error) {
      console.error('[LINKEDIN_AUTH] Validation fetch error:', error)
      return false
    }
  }
}

// Exportar instancia única
export const linkedInAuthService = new LinkedInAuthService()
