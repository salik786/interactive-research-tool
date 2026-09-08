import { config } from 'dotenv';
import { readFileSync } from 'fs';
config({ path: '.env.local' });
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

const res = await fetch(`${url}/auth/v1/token?grant_type=password`, {
  method: 'POST',
  headers: { 'content-type': 'application/json', apikey: anon },
  body: JSON.stringify({ email: 'saleemsalik786+test@gmail.com', password: 'TestPassword123!' }),
});
const authData = await res.json();
const cookieName = `sb-${new URL(url).hostname.split('.')[0]}-auth-token`;
const cookieValue = 'base64-' + Buffer.from(JSON.stringify(authData)).toString('base64');
const cookie = `${cookieName}=${cookieValue}`;

const pdfBuffer = readFileSync('/Users/saliksaleem/Downloads/2025 AI-DrivenTomatoQualityAssessmentADeepLearningApproach (2).pdf');
const formData = new FormData();
formData.append('pdf', new Blob([pdfBuffer], { type: 'application/pdf' }), 'tomato.pdf');

const r = await fetch('https://interactive-research-tool.vercel.app/api/ai/extract-paper', {
  method: 'POST',
  headers: { cookie },
  body: formData,
});
console.log('status', r.status);
console.log(JSON.stringify(await r.json(), null, 2));
