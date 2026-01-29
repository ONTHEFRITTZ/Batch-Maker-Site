export default function SubscriptionPolicy() {
  return (
    <>
      <nav style={styles.nav}>
        <div style={styles.navContent}>
          <div style={styles.logoContainer}>
            <span style={styles.logoIcon}>📋</span>
            <span style={styles.logoText}>Batch Maker</span>
          </div>
          <div style={styles.navLinks}>
            <a href="/" style={styles.navLink}>Home</a>
            <a href="/privacy-policy" style={styles.navLink}>Privacy</a>
            <a href="/terms-of-service" style={styles.navLink}>Terms</a>
            <a href="/support" style={styles.navLink}>Support</a>
          </div>
        </div>
      </nav>

      <main style={styles.container}>
        <div style={styles.header}>
          <h1 style={styles.h1}>Subscription Policy</h1>
        </div>

        <div style={styles.card}>
          <h2 style={styles.h2}>Pricing</h2>
          <ul style={styles.list}>
            <li>30-day free trial</li>
            <li>$5 USD per month</li>
            <li>$50 USD per year</li>
          </ul>

          <h2 style={styles.h2}>Auto-Renewal</h2>
          <p>
            Subscriptions renew automatically unless canceled at least 24 hours
            before the end of the current period.
          </p>

          <h2 style={styles.h2}>Management</h2>
          <p>
            Billing and cancellations are handled by Apple App Store or Google Play.
            Manage your subscription in your account settings.
          </p>
        </div>

        <footer style={styles.footer}>
          <div style={styles.footerLinks}>
            <a href="/privacy-policy" style={styles.footerLink}>Privacy Policy</a>
            <span style={styles.separator}>•</span>
            <a href="/terms-of-service" style={styles.footerLink}>Terms of Service</a>
            <span style={styles.separator}>•</span>
            <a href="/subscription-policy" style={styles.footerLink}>Subscription Policy</a>
            <span style={styles.separator}>•</span>
            <a href="/support" style={styles.footerLink}>Support</a>
          </div>
          <p style={styles.copyright}>© 2026 Batch Maker. All rights reserved.</p>
        </footer>
      </main>
    </>
  );
}

const styles: Record<string, React.CSSProperties> = {
  nav: {
    backgroundColor: "#2d3436",
    borderBottom: "3px solid #636e72",
    position: "sticky",
    top: 0,
    zIndex: 100,
  },
  navContent: {
    maxWidth: 1200,
    margin: "0 auto",
    padding: "1rem 24px",
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
  },
  logoContainer: {
    display: "flex",
    alignItems: "center",
    gap: "0.5rem",
  },
  logoIcon: {
    fontSize: "1.5rem",
  },
  logoText: {
    fontSize: "1.25rem",
    fontWeight: "bold",
    color: "#fff",
  },
  navLinks: {
    display: "flex",
    gap: "1.5rem",
  },
  navLink: {
    color: "#b2bec3",
    textDecoration: "none",
    fontWeight: 500,
    transition: "color 0.2s",
  },
  container: {
    maxWidth: 720,
    margin: "0 auto",
    padding: "48px 24px",
    fontFamily:
      "-apple-system, BlinkMacSystemFont, Segoe UI, Roboto, Helvetica, Arial, sans-serif",
    lineHeight: 1.6,
  },
  header: {
    marginBottom: "2rem",
  },
  h1: {
    fontSize: "2.5rem",
    marginBottom: "0.5rem",
    color: "#2d3436",
  },
  card: {
    backgroundColor: "#f8f9fa",
    borderRadius: "12px",
    padding: "2rem",
    border: "2px solid #e9ecef",
  },
  h2: {
    fontSize: "1.5rem",
    marginTop: "2rem",
    marginBottom: "1rem",
    color: "#2d3436",
  },
  list: {
    fontSize: "1.1rem",
    lineHeight: 2,
  },
  footer: {
    marginTop: "4rem",
    paddingTop: "2rem",
    borderTop: "2px solid #e9ecef",
    textAlign: "center",
  },
  footerLinks: {
    display: "flex",
    justifyContent: "center",
    alignItems: "center",
    gap: "0.75rem",
    flexWrap: "wrap",
    marginBottom: "1rem",
  },
  footerLink: {
    color: "#636e72",
    textDecoration: "none",
    fontSize: "0.9rem",
  },
  separator: {
    color: "#dfe6e9",
  },
  copyright: {
    fontSize: "0.85rem",
    color: "#b2bec3",
    margin: 0,
  },
};