# Draft Reply to Google – OAuth Verification (OpenAI / Privacy Policy)

Use the text below to reply to the Google Developer / Third Party Data Safety Team email. Replace any bracketed placeholders with your actual app name or URLs.

---

**Subject:** Re: [Action Needed] OAuth Verification Request Acknowledgement

**To:** (reply to the same thread from API OAuth Dev Verification / Google Developer)

---

Dear Third Party Data Safety Team,

Thank you for your guidance regarding the use of a third-party AI provider and the required updates to our application and privacy policy. We have completed both of the following:

**1. Application architecture update**

We have completely removed the OpenRouter integration and implemented OpenAI as our AI provider. Our application now uses the OpenAI API exclusively for optional AI-assisted features (e.g. post description suggestions, inbox and comment reply drafts, reel captions and analysis). The specific service tier and configuration we use with OpenAI guarantees that data transmitted to them is **not used to train generalized AI or machine learning models**. We have verified that our usage complies with OpenAI’s terms for enterprise / no-training use.

**2. Privacy policy update**

We have updated our Privacy Policy to accurately reflect our new data sharing practices:

- **Disclosure of third-party service:** Our Privacy Policy now clearly discloses that we share data with **OpenAI** when users choose to use AI-assisted features. We describe which features use OpenAI (post descriptions, reply drafts, reel captions/analysis) and that we send only the minimal content necessary (e.g. brand context, post topic, or message text the user chooses to process) to generate suggestions.

- **Affirmative statement on training:** Our Privacy Policy includes an explicit statement that **Google User Data is not used to train generalized AI or machine learning models**. This appears in both our “How we use your data” section and our “Sharing and disclosure” section, where we also confirm that we use a service tier and configuration with OpenAI that guarantees data is not used for such training, and that we comply with the Google API Services User Data Policy’s Limited Use requirements.

The updated Privacy Policy is live at: [INSERT YOUR PRIVACY POLICY URL, e.g. https://agent4socials.com/privacy]

We believe these updates fully address the conditions you outlined. We would be grateful if you could proceed with our verification review. If you need any further information or changes, please let us know.

Thank you,

[Your name]  
[Your app name, e.g. Agent4Socials]  
[Support email]
