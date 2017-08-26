const fs      = require('fs');
const path    = require('path');
const util    = require(path.join(process.cwd(),'helpers','utility.js'));
const request = require('request');
const baseurl = 'https://api.adx1.com';

function getAgencySpend(agency_id) {
    return new Promise((resolve,reject)=> {
        if(!agency_id) {
            reject('Advertier ID(s) is required.');
        } else {
            keepAlive()
            .then(() => {
                let date_now    = new Date((new Date()).toUTCString()).toISOString();
                let matches     = date_now.match(/(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})/);
                let timestamp   = {
                    YYYY: matches[1],
                    MM: matches[2],
                    DD: matches[3],
                    hh: matches[4],
                    mm: matches[5],
                    ss: matches[6]
                }
                let start_date  = `${timestamp.YYYY}-${timestamp.MM}-01`;
                let ended_date  = `${timestamp.YYYY}-${timestamp.MM}-${(new Date(timestamp.YYYY, timestamp.MM, 0)).getDate()}`;
                let auth_data   = JSON.parse(util.read_log('dsp-auth.log'));
                request(
                    {
                        url: `${baseurl}/module/Cpmplatform/reportDruid/`,
                        method: 'POST',
                        headers: {
                            authorization: 'Bearer'+auth_data.access_token
                        },
                        form: {
                            "from": start_date,
                            "to": ended_date,
                            "search_columns[0]": "impressions",
                            "search_columns[1]": "advertiser_spend",
                            "filter[agency_id][id][0]": agency_id
                        }
                    },
                    (error,response,body)=>{
                        try {
                            let result = JSON.parse(body);
                            let final_result = {
                                status: 200,
                                data: {
                                    imps: result.response.fields.total.impressions,
                                    spend: result.response.fields.total.advertiser_spend,
                                },
                                date: timestamp
                            };
                            resolve(final_result);
                        } catch(error) {
                            util.append_log('dsp-reqs.log',error);
                            reject(error);
                        }
                    }
                );
            })
            .catch((error) => {
                util.append_log('dsp-reqs.log',error);
                reject(error);
            });
        }
    });
}

function keepAlive() {
    let auth_data = JSON.parse(util.read_log('dsp-auth.log'));
    let retry = 0;
    return new Promise((resolve,reject) => {
        // Ensure access token is active.
        let auth_exp = (new Date(auth_data.expire_date)).getTime() - (1800 * 1000); // Advance 30 minutes ahead of expiry date.
        let date_now = (new Date((new Date()).toUTCString())).getTime();

        if(date_now > auth_exp) { // If token is expired.
            let lock_data = lockAuth();
            if(lock_data.locked) { // If there is ongoing authentication request.
                if((new Date(lock_data.last_run)).getTime() > (date_now + 60000)) {
                    // If last auth happened 1 minute ago, re-authenticate.
                    util.append_log('dsp-reqs.log','Sessions has expired. Re-authenticating...');
                    authenticate().then((data)=>{
                        util.append_log('dsp-reqs.log',data);
                        resolve(data);
                    }).catch((error)=>{
                        reject(error);
                    });
                } else {
                    let retry = 0;
                    let retry_max = 15;
                    let waiter = setInterval(()=>{
                        if(retry < retry_max) {
                            if(lockAuth().locked) {
                                retry++;
                            } else {
                                clearInterval(waiter);
                                let message = `Session renewed after ${retry} seconds.`;
                                resolve(message);
                            }
                        } else {
                            clearInterval(waiter);
                            let message = `Request timed out after ${retry_max} seconds.`;
                            util.append_log('dsp-reqs.log',message);
                            reject(message);
                        }
                    },1000);
                }
            } else {
                // Re-authenticate.
                util.append_log('dsp-reqs.log','Sessions has expired. Re-authenticating...');
                authenticate().then((data)=>{
                    util.append_log('dsp-reqs.log',data);
                    resolve(data);
                }).catch((error)=>{
                    reject(error);
                });
            }
        } else {
            resolve('Session is still active.');
        }
    });
}

function lockAuth(status) {
    let lock_file = path.join(process.cwd(),'logs','dsp-auth.lock');
    let data      = { last_run: (new Date((new Date()).toUTCString())).toISOString() };

    if(status === true) {
        data.locked = true;
        fs.writeFileSync(lock_file,JSON.stringify(data));
    } else if(status === false) {
        data.locked = false;
        fs.writeFileSync(lock_file,JSON.stringify(data));
    } else {
        return JSON.parse(fs.readFileSync(lock_file).toString());
    }
}

function authenticate() {
    lockAuth(true);
    return new Promise((resolve,reject)=> {
        let username = process.env.RTB_DSP_USER;
        let password = process.env.RTB_DSP_PASS;

        if(username && password) {
            request(
                {
                    url: `${baseurl}/v1/auth`,
                    method: 'POST',
                    form: {
                        grant_type: 'password',
                        client_id: 'testclient',
                        client_secret: 'testpass',
                        scope: 'access_token expires_in refresh_token token_type',
                        username: username,
                        password: password
                    }
                },
                (error,response,body)=>{
                    lockAuth(false);
                    if(error) {
                        reject(error);
                    } else {
                        let api_res = JSON.parse(body);

                        if(!api_res.access_token) { // If access token is not present.
                            reject('DSP login failed.');
                        } else {
                            let date_now = new Date((new Date()).toUTCString());
                            api_res.expire_date = (new Date(date_now.setTime(date_now.getTime() + (api_res.expires_in * 1000)))).toISOString();
                            util.write_log('dsp-auth.log',JSON.stringify(api_res));
                            resolve('DSP login success.');
                        }
                    }
                }
            );
        } else {
            lockAuth(false);
            reject("Credentials not found in environment variables.");
        }
    });
}

module.exports = {
    getAgencySpend
}