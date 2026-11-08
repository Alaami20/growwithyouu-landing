export const CEO_EMAIL='alaamiari@growwithyouu.com';
export async function requestEmailCode(client){
 const {error}=await client.auth.signInWithOtp({email:CEO_EMAIL,options:{shouldCreateUser:false}});
 if(error)throw error;
}
export async function verifyEmailCode(client,token){
 if(!/^[0-9]{6,10}$/.test(token))throw Error('Enter the numeric code from your email.');
 const {data,error}=await client.auth.verifyOtp({email:CEO_EMAIL,token,type:'email'});
 if(error)throw error;
 if(data.user?.email?.toLowerCase()!==CEO_EMAIL||!data.user?.email_confirmed_at){
  await client.auth.signOut({scope:'local'});
  throw Error('Verified CEO email required.');
 }
 return data;
}
