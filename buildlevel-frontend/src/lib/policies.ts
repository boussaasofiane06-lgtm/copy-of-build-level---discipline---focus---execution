export type PolicySection = {
  heading: string;
  body?: string;
  bullets?: string[];
};

export type PolicyPageContent = {
  slug: string;
  title: string;
  subtitle: string;
  lastUpdated: string;
  sections: PolicySection[];
};

export const LAST_UPDATED = "June 4, 2026";

export const policies: PolicyPageContent[] = [
  {
    slug: "return-refund-policy",
    title: "Return & Refund Policy",
    subtitle: "Clear standards for apparel issues, digital access, and support review.",
    lastUpdated: LAST_UPDATED,
    sections: [
      {
        heading: "Apparel return eligibility",
        body: "Build Level apparel returns are reviewed case by case. Returns are only accepted when the item arrives damaged, defective, incorrect, or has a verified printing/production issue.",
        bullets: [
          "Contact support within 7 days of delivery.",
          "Items must be unused, unworn, and in original condition.",
          "Photos of damage, defect, wrong item, or printing issue may be required.",
          "Refunds or replacements are approved only after support review.",
        ],
      },
      {
        heading: "Non-returnable situations",
        bullets: [
          "No returns for wrong size if the customer selected that size.",
          "No returns for buyer's remorse.",
          "No returns for used, washed, altered, or damaged-by-customer items.",
          "No refund is guaranteed before review is complete.",
        ],
      },
      {
        heading: "Digital products",
        body: "Digital PDFs, audiobooks, and downloads are non-refundable once accessed or downloaded. If access fails, support will help restore access or replace a broken file.",
      },
    ],
  },
  {
    slug: "shipping-policy",
    title: "Shipping Policy",
    subtitle: "How apparel production, fulfillment, tracking, and carrier delays work.",
    lastUpdated: LAST_UPDATED,
    sections: [
      {
        heading: "Fulfillment",
        body: "Build Level apparel is fulfilled through third-party production and fulfillment partners. Production time and shipping time may vary depending on item type, destination, volume, and carrier conditions.",
      },
      {
        heading: "Tracking",
        bullets: [
          "Tracking information is provided when available from the fulfillment partner or carrier.",
          "Tracking may take time to update after an order is created.",
          "Customers should verify their shipping address before checkout.",
        ],
      },
      {
        heading: "Delays",
        body: "Build Level is not responsible for shipping delays caused by carriers, incorrect addresses, weather, customs, holidays, or other events outside our control. Support will help review issues where possible.",
      },
    ],
  },
  {
    slug: "digital-product-policy",
    title: "Digital Product Policy",
    subtitle: "Terms for PDFs, audiobooks, guides, and downloadable Build Level resources.",
    lastUpdated: LAST_UPDATED,
    sections: [
      {
        heading: "Digital access",
        bullets: [
          "Digital products are delivered electronically after successful payment.",
          "The success page verifies the Stripe checkout session before showing access.",
          "Download access may be limited by download count and expiration period.",
          "Customers should save their receipt and success page link for support.",
        ],
      },
      {
        heading: "Refunds",
        body: "Digital PDFs, audiobooks, and downloads are non-refundable once accessed or downloaded. If a file is broken, missing, or inaccessible, Build Level will resend, replace, or restore access after review.",
      },
      {
        heading: "Usage",
        body: "Digital products are for personal use only and may not be resold, redistributed, uploaded publicly, or shared as a product file.",
      },
    ],
  },
  {
    slug: "download-access-policy",
    title: "Download Access Policy",
    subtitle: "How download links, limits, expiration, and access recovery work.",
    lastUpdated: LAST_UPDATED,
    sections: [
      {
        heading: "Secure download access",
        bullets: [
          "Access is tied to the Stripe checkout session and purchase email.",
          "Download links may expire for security.",
          "If a link expires, reopening the verified success page can generate a fresh secure link when access remains valid.",
          "Download counts and expiration windows may apply.",
        ],
      },
      {
        heading: "Support recovery",
        body: "If a customer paid but did not receive access, support can review the payment and help restore access. Customers should provide full name, email, order number or Stripe receipt, product purchased, and issue description.",
      },
    ],
  },
  {
    slug: "privacy-policy",
    title: "Privacy Policy",
    subtitle: "How Build Level handles customer information and website activity.",
    lastUpdated: LAST_UPDATED,
    sections: [
      {
        heading: "Information we collect",
        bullets: [
          "Contact form details such as name, email, and message.",
          "Order and checkout details processed through secure payment providers.",
          "Engagement data such as comments, reviews, likes, ratings, IP/session identifiers for moderation and spam prevention.",
          "Support chat details submitted through Tidio or website forms.",
        ],
      },
      {
        heading: "How we use information",
        body: "We use information to process orders, deliver digital access, provide support, moderate user-generated content, improve customer experience, prevent fraud/spam, and communicate with customers.",
      },
      {
        heading: "Payment security",
        body: "Build Level does not store full card numbers. Payments are processed by Stripe or other secure providers. Do not send payment card details through chat, comments, or contact forms.",
      },
    ],
  },
  {
    slug: "terms-conditions",
    title: "Terms & Conditions",
    subtitle: "Rules for using the Build Level website, products, content, and services.",
    lastUpdated: LAST_UPDATED,
    sections: [
      {
        heading: "Use of website",
        body: "By using Build Level, purchasing products, submitting reviews, or using support features, you agree to follow these terms and all applicable policies.",
      },
      {
        heading: "Products and availability",
        bullets: [
          "Prices, availability, product details, and policies may change.",
          "Digital products are delivered electronically and governed by the Digital Product Policy.",
          "Apparel is governed by the Apparel, Shipping, and Return & Refund policies.",
        ],
      },
      {
        heading: "User-generated content",
        body: "Comments and reviews must be respectful, honest, and relevant. Build Level may moderate, hide, reject, remove, or block content that is spam, abusive, hateful, threatening, or unsafe.",
      },
    ],
  },
  {
    slug: "support-policy",
    title: "Contact / Support Policy",
    subtitle: "How to contact Build Level and what support needs to resolve issues.",
    lastUpdated: LAST_UPDATED,
    sections: [
      {
        heading: "How to contact support",
        bullets: [
          "Use the website contact form.",
          "Use Tidio live chat when available.",
          "Email info@thebuildlevel.com for direct support.",
        ],
      },
      {
        heading: "Information support may request",
        bullets: [
          "Full name.",
          "Email address.",
          "Order number or Stripe receipt.",
          "Product purchased.",
          "Issue description.",
          "Photos for apparel damage, defect, wrong item, or printing issue.",
        ],
      },
      {
        heading: "Tidio/Lyro support guidance",
        body: "Tidio may answer common policy questions using this policy center. If it cannot resolve an issue, it should collect the customer's name, email, order number, product purchased, and issue description, then tell the customer support will review the issue.",
      },
    ],
  },
  {
    slug: "apparel-policy",
    title: "Apparel Policy",
    subtitle: "Standards for Build Level apparel orders, sizing, quality, and fulfillment.",
    lastUpdated: LAST_UPDATED,
    sections: [
      {
        heading: "Sizing",
        body: "Customers are responsible for selecting the correct size before checkout. Build Level does not accept returns for wrong size if the size was selected by the customer.",
      },
      {
        heading: "Quality issues",
        bullets: [
          "Contact support within 7 days of delivery for damaged, defective, wrong item, or printing issues.",
          "Provide photos and order details for review.",
          "Approved issues may be resolved with a replacement, refund, or other appropriate support action.",
        ],
      },
      {
        heading: "Fulfillment",
        body: "Apparel may be produced and shipped by Printify or other fulfillment partners. Tracking is provided when supported by the carrier/partner.",
      },
    ],
  },
  {
    slug: "payment-security-policy",
    title: "Payment & Security Policy",
    subtitle: "Secure checkout standards for apparel and digital products.",
    lastUpdated: LAST_UPDATED,
    sections: [
      {
        heading: "Secure payments",
        body: "Build Level uses secure payment providers such as Stripe. Card information is handled by the payment provider and is not stored in full by Build Level.",
      },
      {
        heading: "Digital delivery security",
        bullets: [
          "Digital access is verified through paid checkout sessions.",
          "Download links may expire for protection.",
          "Download limits may apply to prevent abuse.",
        ],
      },
      {
        heading: "Fraud and abuse prevention",
        body: "Build Level may review suspicious orders, comments, ratings, reviews, download activity, and support requests for fraud, spam, or abuse prevention.",
      },
    ],
  },
];

export const faqItems = [
  { question: "Where is my order?", answer: "Check your tracking link if one was provided. Apparel production and carrier updates can take time. If tracking is missing or stalled, contact support with your full name, email, order number, and product purchased." },
  { question: "How do I access my digital download?", answer: "After successful Stripe payment, the website redirects to a digital success page with a secure download button. If the page does not load, contact support with your payment receipt and email." },
  { question: "Do you offer refunds?", answer: "Digital products are non-refundable once accessed or downloaded. Apparel refunds are reviewed only for damaged, defective, wrong item, or printing issues." },
  { question: "Can I return apparel?", answer: "Apparel returns are accepted only for approved damage, defect, wrong item, or printing issue claims submitted within 7 days of delivery." },
  { question: "What if I bought the wrong size?", answer: "Wrong-size purchases are not returnable if the customer selected the size. Please review size information before checkout." },
  { question: "What if my item arrived damaged?", answer: "Contact support within 7 days of delivery and include photos, order number, email, and issue description. Approved cases may receive a replacement or refund." },
  { question: "What if I never received my PDF or audiobook?", answer: "Contact support with your name, email, order number or Stripe receipt, and product purchased. Support can review payment and restore access when valid." },
  { question: "How long does shipping take?", answer: "Shipping time varies by production partner, carrier, destination, and seasonal volume. Tracking is provided when available." },
  { question: "Is checkout secure?", answer: "Yes. Checkout is processed by secure payment providers such as Stripe. Do not send card information through chat or contact forms." },
  { question: "How do I contact support?", answer: "Use Tidio live chat, the website contact form, or email info@thebuildlevel.com. For order issues, include your full name, email, order number, product purchased, and issue description." },
];

export const knowledgeBaseSections = [
  { heading: "Returns", answer: "Only damaged, defective, wrong item, or printing issue apparel claims are reviewed. Contact support within 7 days of delivery. Wrong size and buyer's remorse are not return reasons." },
  { heading: "Refunds", answer: "Refunds are not automatic. Digital products are non-refundable after access/download. Apparel refunds require support review and proof of issue." },
  { heading: "Shipping", answer: "Apparel is fulfilled by third-party production/fulfillment partners. Shipping and tracking depend on production and carrier timelines." },
  { heading: "Digital downloads", answer: "Digital products are delivered after successful Stripe payment through a secure success page and download button. Download limits and expiration may apply." },
  { heading: "Apparel issues", answer: "For damaged, defective, wrong item, or printing problems, collect name, email, order number, product purchased, photos, and issue description." },
  { heading: "Payment issues", answer: "If payment succeeded but access/order confirmation failed, collect full name, email, order number or Stripe receipt, product purchased, and issue description." },
  { heading: "Order tracking", answer: "Use the tracking link when available. If missing, collect full name, email, order number, and product purchased for support review." },
  { heading: "Contact support", answer: "Support can be reached through Tidio, the website contact form, or info@thebuildlevel.com." },
  { heading: "Download access problems", answer: "If a customer cannot access a paid digital file, collect full name, email, order number/receipt, product purchased, and issue description. Support will review and restore access if valid." },
];

export function getPolicyBySlug(slug?: string) {
  return policies.find(policy => policy.slug === slug);
}
