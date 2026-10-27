// The site's tracking plan: dataLayer events the website pushes. In Phase 2 this would come from
// a tracking-plan document or GTM preview/tag diagnostics rather than being hand-written.

export const siteTrackingPlan = {
  domain: 'www.brightpathsolar.example',
  events: [
    { event: 'quote_submit', description: 'Quote request form submitted successfully', params: ['event_id', 'lead_type', 'user_data.email', 'user_data.phone'] },
    { event: 'consult_booked', description: 'Consultation booked in the scheduler', params: ['event_id', 'user_data.email', 'user_data.phone'] },
    { event: 'phone_click', description: 'Click on a tel: link', params: ['event_id'] },
    { event: 'newsletter_signup', description: 'Newsletter form submitted', params: ['event_id', 'user_data.email'] },
  ],
};
