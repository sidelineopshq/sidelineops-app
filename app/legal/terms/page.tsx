export const metadata = { title: 'Terms of Service | SidelineOps' }

export default function TermsPage() {
  return (
    <div className="min-h-screen bg-slate-950 text-white">
      {/* Header */}
      <div className="border-b border-white/10 bg-slate-900/80">
        <div className="mx-auto max-w-3xl px-6 py-4 flex items-center gap-3">
          <a href="/">
            <img
              src="/sidelineops-logo-cropped.png"
              alt="SidelineOps"
              style={{ height: '24px', width: 'auto', opacity: 0.85 }}
            />
          </a>
        </div>
      </div>

      {/* Content */}
      <main className="mx-auto max-w-3xl px-6 py-12">
        <div className="mb-10">
          <h1 className="text-3xl font-bold mb-2">Terms of Service</h1>
          <p className="text-sm text-slate-400">Last updated: April 2026</p>
        </div>

        <div className="space-y-10 text-slate-300 leading-relaxed">

          <section>
            <h2 className="text-lg font-semibold text-white mb-3">1. Acceptance of Terms</h2>
            <p>
              By accessing or using SidelineOps ("the Service"), you agree to be bound by these Terms of Service. If you do not agree to these terms, please do not use the Service. These terms apply to all users of the Service, including coaches, administrators, volunteers, and any other users.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-white mb-3">2. Description of Service</h2>
            <p className="mb-3">
              SidelineOps is a team operations platform designed for high school athletic programs. The Service provides tools for:
            </p>
            <ul className="list-disc list-inside space-y-1.5 text-slate-400 pl-2">
              <li>Schedule management and event coordination</li>
              <li>Contact management for parents, players, and staff</li>
              <li>Volunteer coordination and sign-up</li>
              <li>Team notifications via email, SMS, and GroupMe</li>
            </ul>
            <p className="mt-3">
              The Service is provided on a subscription basis and may be updated, modified, or discontinued at any time. We will make reasonable efforts to notify users of significant changes.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-white mb-3">3. User Accounts</h2>
            <p className="mb-3">
              To access the Service, you must create an account. By creating an account, you agree to:
            </p>
            <ul className="list-disc list-inside space-y-1.5 text-slate-400 pl-2">
              <li>Provide accurate, complete, and current information</li>
              <li>Maintain the security of your password and account credentials</li>
              <li>Notify us immediately of any unauthorized access to your account</li>
              <li>Maintain only one account per person</li>
              <li>Accept responsibility for all activity that occurs under your account</li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-white mb-3">4. Acceptable Use</h2>
            <p className="mb-3">You agree not to use the Service to:</p>
            <ul className="list-disc list-inside space-y-1.5 text-slate-400 pl-2">
              <li>Violate any applicable local, state, national, or international law or regulation</li>
              <li>Share your login credentials with any other person</li>
              <li>Attempt to access, query, or collect data from other users' accounts</li>
              <li>Transmit any unsolicited or unauthorized advertising or promotional material</li>
              <li>Interfere with or disrupt the integrity or performance of the Service</li>
              <li>Attempt to gain unauthorized access to any part of the Service</li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-white mb-3">5. Data and Privacy</h2>
            <p className="mb-3">
              Your use of the Service is also governed by our <a href="/legal/privacy" className="text-sky-400 hover:text-sky-300 underline">Privacy Policy</a>, which is incorporated into these Terms by reference.
            </p>
            <p>
              User data collected through the Service is used solely to provide, maintain, and improve the Service. We do not sell your personal information to third parties. By using the Service, you consent to the collection and use of information as described in the Privacy Policy.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-white mb-3">6. Notifications</h2>
            <p className="mb-3">
              SidelineOps enables teams to communicate with parents and contacts via email and SMS notifications. By using the Service:
            </p>
            <ul className="list-disc list-inside space-y-1.5 text-slate-400 pl-2">
              <li>Contacts who are added to a team and who sign up or provide their contact information consent to receive relevant team notifications</li>
              <li>An unsubscribe option is provided on every notification email</li>
              <li>SMS consent is explicitly captured at the time of subscription</li>
              <li>Users can unsubscribe from notifications at any time</li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-white mb-3">7. Limitation of Liability</h2>
            <p className="mb-3">
              The Service is provided "as is" and "as available" without warranties of any kind, either express or implied, including but not limited to implied warranties of merchantability, fitness for a particular purpose, or non-infringement.
            </p>
            <p>
              To the maximum extent permitted by applicable law, SidelineOps shall not be liable for any indirect, incidental, special, consequential, or punitive damages, including but not limited to loss of profits, data, use, goodwill, or other intangible losses, resulting from your access to or use of (or inability to access or use) the Service.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-white mb-3">8. Changes to Terms</h2>
            <p>
              We reserve the right to modify these Terms at any time. When we make material changes, we will provide notice through the Service or by email. Your continued use of the Service after any changes constitutes your acceptance of the new Terms. We encourage you to review these Terms periodically.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-white mb-3">9. Contact</h2>
            <p>
              If you have questions about these Terms of Service, please contact us at{' '}
              <a href="mailto:support@sidelineopshq.com" className="text-sky-400 hover:text-sky-300 underline">
                support@sidelineopshq.com
              </a>.
            </p>
          </section>

        </div>
      </main>

      {/* Footer */}
      <footer className="border-t border-white/10 mt-16">
        <div className="mx-auto max-w-3xl px-6 py-6 text-center text-xs text-slate-600 space-x-3">
          <a href="/" className="hover:text-slate-400 transition-colors">Home</a>
          <span>·</span>
          <a href="/legal/privacy" className="hover:text-slate-400 transition-colors">Privacy Policy</a>
          <span>·</span>
          <span>© 2026 SidelineOps</span>
        </div>
      </footer>
    </div>
  )
}
