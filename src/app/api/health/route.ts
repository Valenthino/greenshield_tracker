import { response, configured } from '@/lib/server';
export const dynamic='force-dynamic';
export async function GET(){return response({ok:true,authenticationConfigured:configured()});}
