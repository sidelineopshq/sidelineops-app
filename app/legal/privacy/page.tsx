export const metadata = { title: 'Privacy Policy | SidelineOps' }

export default function PrivacyPage() {
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
          <h1 className="text-3xl font-bold mb-2">Privacy Policy</h1>
          <p className="text-sm text-slate-400">Last updated: April 2026</p>
          <div className="mt-4 rounded-xl border border-yellow-500/20 bg-yellow-500/10 px-4 py-3 text-sm text-yellow-400">
            <strong>Note:</strong> This is a placeholder document for the beta period. It should be reviewed by a qualified attorney before public launch.
          </div>
        </div>

        <div className="space-y-10 text-slate-300 leading-relaxed">

          <section>
            <h2 className="text-lg font-semibold text-white mb-3">1. Introduction</h2>
            <p>
              SidelineOps ("we," "us," or "our") operates sidelineopshq.com and provides team operations software for high school athletic programs. This Privacy Policy explains how we collect, use, store, and protect your information when you use our Service. By using SidelineOps, you agree to the practices described in this policy.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-white mb-3">2. Information We Collect</h2>
            <p className="mb-3">We collect the following types of information:</p>

            <h3 className="text-sm font-semibold text-slate-200 mb-2 mt-4">Account Information</h3>
            <ul className="list-disc list-inside space-y-1.5 text-slate-400 pl-2">
              <li>Name and email address</li>
              <li>Password (stored as a secure hash — we never store plaintext passwords)</li>
              <li>Role within the program (coach, admin, volunteer coordinator, etc.)</li>
            </ul>

            <h3 className="text-sm font-semibold text-slate-200 mb-2 mt-4">Team and Program Information</h3>
            <ul className="list-disc list-inside space-y-1.5 text-slate-400 pl-2">
              <li>School name and athletic program details</li>
              <li>Sport and team level (varsity, JV, etc.)</li>
              <li>Schedule data including event dates, times, locations, and opponents</li>
            </ul>

            <h3 className="text-sm font-semibold text-slate-200 mb-2 mt-4">Contact Information</h3>
            <ul className="list-disc list-inside space-y-1.5 text-slate-400 pl-2">
              <li>Parent and player names, phone numbers, and email addresses</li>
              <li>Relationship to the team (parent, player, volunteer, etc.)</li>
              <li>Notification preferences and subscription status</li>
            </ul>

            <h3 className="text-sm font-semibold text-slate-200 mb-2 mt-4">Usage Data</h3>
            <ul className="list-disc list-inside space-y-1.5 text-slate-400 pl-2">
              <li>Pages visited and features used within the Service</li>
              <li>Browser type and device information</li>
              <li>IP address and general location (country/region)</li>
              <li>Error logs and diagnostic information</li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-white mb-3">3. How We Use Information</h2>
            <p className="mb-3">We use the information we collect to:</p>
            <ul className="list-disc list-inside space-y-1.5 text-slate-400 pl-2">
              <li>Provide, operate, and maintain the Service</li>
              <li>Send team schedule notifications and alerts that users have requested</li>
              <li>Send service-related emails (account verification, password resets, etc.)</li>
              <li>Improve and develop new features of the Service</li>
              <li>Respond to support requests and feedback</li>
              <li>Monitor for fraud, abuse, and security issues</li>
            </ul>
            <p className="mt-3 font-medium text-white">
              We never sell your personal information to third parties.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-white mb-3">4. Data Storage and Security</h2>
            <p className="mb-3">
              We take data security seriously and employ industry-standard practices to protect your information:
            </p>
            <ul className="list-disc list-inside space-y-1.5 text-slate-400 pl-2">
              <li>All data is stored securely using <strong className="text-slate-300">Supabase</strong>, which provides encrypted databases and row-level security</li>
              <li>All data is transmitted over encrypted HTTPS connections</li>
              <li>Passwords are hashed using industry-standard algorithms and are never stored in plaintext</li>
              <li>Access to production data is strictly limited to authorized personnel</li>
            </ul>
            <p className="mt-3">
              While we take these precautions, no system is 100% secure. We encourage you to use a strong, unique password for your account.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-white mb-3">5. SMS and Email Communications</h2>
            <p className="mb-3">
              SidelineOps sends notifications on behalf of athletic programs to parents and contacts. Regarding these communications:
            </p>
            <ul className="list-disc list-inside space-y-1.5 text-slate-400 pl-2">
              <li>Parents and contacts are added by team administrators and consent to notifications when joining a team's communication list</li>
              <li>Every notification email includes a clear unsubscribe link</li>
              <li>SMS consent is explicitly captured at the time of subscription — we do not send unsolicited text messages</li>
              <li>You can unsubscribe from email notifications at any time by clicking the unsubscribe link in any email</li>
              <li>To opt out of SMS notifications, reply STOP to any message</li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-white mb-3">6. Third-Party Services</h2>
            <p className="mb-3">
              We use the following third-party services to operate SidelineOps. Each service has its own privacy policy governing how they handle data:
            </p>
            <ul className="list-disc list-inside space-y-1.5 text-slate-400 pl-2">
              <li><strong className="text-slate-300">Supabase</strong> — database storage and user authentication</li>
              <li><strong className="text-slate-300">Resend</strong> — transactional email delivery</li>
              <li><strong className="text-slate-300">Vercel</strong> — application hosting and infrastructure</li>
              <li><strong className="text-slate-300">GroupMe</strong> (optional) — team group messaging integration, when enabled by a program</li>
            </ul>
            <p className="mt-3">
              We only share data with these providers to the extent necessary to provide the Service.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-white mb-3">7. Children's Privacy</h2>
            <p>
              SidelineOps is designed for use by coaches, administrators, and parents — all of whom must be 18 years of age or older to create an account. We do not knowingly collect personal information from children under 13. If you believe a child under 13 has provided us with personal information, please contact us immediately at <a href="mailto:support@sidelineopshq.com" className="text-sky-400 hover:text-sky-300 underline">support@sidelineopshq.com</a> and we will take steps to delete such information.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-white mb-3">8. Your Rights</h2>
            <p className="mb-3">You have the right to:</p>
            <ul className="list-disc list-inside space-y-1.5 text-slate-400 pl-2">
              <li><strong className="text-slate-300">Access your data</strong> — request a copy of the personal information we hold about you</li>
              <li><strong className="text-slate-300">Correct your data</strong> — update inaccurate or incomplete information through your profile settings</li>
              <li><strong className="text-slate-300">Delete your account</strong> — request deletion of your account and associated data</li>
              <li><strong className="text-slate-300">Unsubscribe from notifications</strong> — opt out of email or SMS communications at any time</li>
            </ul>
            <p className="mt-3">
              To exercise any of these rights, contact us at{' '}
              <a href="mailto:support@sidelineopshq.com" className="text-sky-400 hover:text-sky-300 underline">
                support@sidelineopshq.com
              </a>.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-white mb-3">9. Changes to This Policy</h2>
            <p>
              We may update this Privacy Policy from time to time. When we make material changes, we will notify users by email or by displaying a prominent notice within the Service. We encourage you to review this policy periodically. Your continued use of the Service after changes are posted constitutes your acceptance of the updated policy.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-white mb-3">10. Contact Us</h2>
            <p>
              If you have questions, concerns, or requests regarding this Privacy Policy or your personal data, please contact us at{' '}
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
          <a href="/legal/terms" className="hover:text-slate-400 transition-colors">Terms of Service</a>
          <span>·</span>
          <span>© 2026 SidelineOps</span>
        </div>
      </footer>
    </div>
  )
}
