const fs      = require('fs');
const csvp    = require('csv-parse');
const path    = require('path');
const util    = require(path.join(process.cwd(),'helpers','utility.js'));
const request = require('request');
const baseurl = 'https://api.appnexus.com';

function inArray(needle, haystack) {
    var length = haystack.length;
    for(var i = 0; i < length; i++) {
        if(haystack[i] == needle) return true;
    }
    return false;
}

function getAgencySpend(agency_id,report_interval="month_to_date") {
    return new Promise((resolve,reject)=> {
        let intervals = [
            "month_to_yesterday",
            "month_to_date",
            "last_month",
            "last_30_days",
            "last_7_days",
            "last_2_days",
            "last_48_hours",
            "today"
        ];
        if(!agency_id) {
            reject('Agency ID is required.');
        } else if(!inArray(report_interval,intervals)) {
            reject('Invalid report interval.');
        } else {
            getAdvertisers(agency_id)
            .then((advs_data) => {
                let adv_ids = []; for(adv of advs_data) adv_ids.push(adv.id);
                let request_body = {
                    "report": {
                        "report_type":"network_analytics",
                        "columns": ["seller_member_name","seller_member_id","cost","imps"],
                        "filters": [{"advertiser_id": adv_ids}],
                        "report_interval": report_interval,
                        "format":"csv"
                    }
                }
                post('report',JSON.stringify(request_body))
                .then((report_data)=>{
                    let date_now    = new Date((new Date()).toUTCString()).toISOString();
                    let matches     = date_now.match(/(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})/);
                    let timestamp   = { YYYY: matches[1], MM: matches[2], DD: matches[3], hh: matches[4], mm: matches[5], ss: matches[6] };
                    let response    = { status: 200, data: {}, date: timestamp };
                    let report_info = JSON.parse(report_data);
                    if(typeof report_info.response.report_id !== "undefined") {
                        getReport(report_info.response.report_id)
                        .then((csv_text)=>{
                            csvp(csv_text,{columns:true},(error,csv_obs)=>{
                                if(error) {
                                    util.append_log('dsp-reqs.log',error);
                                    reject(error);
                                } else {
                                    let spend_data = {
                                        "google": {"media_cost":1,"imps":1},
                                        "yahoo": {"media_cost":1,"imps":1},
                                        "others": {"media_cost":1,"imps":1},
                                        "total": {"media_cost":1,"imps":1},
                                    }
                                    for(csv_ob of csv_obs) {
                                        if(csv_ob.seller_member_id == 181) {
                                            spend_data.google.media_cost += Number(csv_ob.cost);
                                            spend_data.google.imps += Number(csv_ob.imps);
                                        } else if(csv_ob.seller_member_id == 273) {
                                            spend_data.yahoo.media_cost += Number(csv_ob.cost);
                                            spend_data.yahoo.imps += Number(csv_ob.imps);
                                        } else {
                                            spend_data.others.media_cost += Number(csv_ob.cost);
                                            spend_data.others.imps += Number(csv_ob.imps);
                                        }
                                        spend_data.total.media_cost += Number(csv_ob.cost);
                                        spend_data.total.imps += Number(csv_ob.imps);
                                    }
                                    response.data = spend_data;
                                    resolve(response);
                                }
                            });
                        })
                        .catch((error) => {
                            console.log(error);
                            util.append_log('dsp-reqs.log',error); 
                            reject(error);
                        });
                    } else {
                        response.status = 500;
                        response.message = "Invalid response.";
                        reject(response);
                    }
                })
                .catch((error) => {
                    console.log(error);
                    util.append_log('dsp-reqs.log',error);
                    reject(error);
                });
            })
            .catch((error) => {
                console.log(error);
                util.append_log('dsp-reqs.log',error);
                reject(error);
            });
        }
    });
}

function getAdvertisers(agency_id) {
    return new Promise((resolve,reject)=>{
        get(`user?id=${agency_id}`)
        .then((data)=>{
            let response_data = JSON.parse(data);
            if(typeof response_data.response.user.advertiser_access !== "undefined") {
                resolve(response_data.response.user.advertiser_access);
            } else {
                reject(response_data);
            }
        })
        .catch((error)=>{
            reject(error);
        })
    });
}

function getReport(report_id) {
    return new Promise((resolve,reject)=>{
        let retry_count = 0;
        let retry_max = 10;
        function checkReport() {
            if(retry_count < retry_max) {
                retry_count++;
                get(`report?id=${report_id}`)
                .then((report_data)=>{
                    try {
                        let report_info = JSON.parse(report_data);
                        if(report_info.response.execution_status == "ready") {
                            get(report_info.response.report.url)
                            .then((csv_data)=>{
                                resolve(csv_data);
                            })
                            .catch((error) => {
                                reject(error);
                            });
                        } else {
                            setTimeout(checkReport,1500);
                        }
                    } catch(error) {
                        reject(error);
                    }
                })
                .catch((error) => {
                    reject(error);
                });
            } else {
                reject(error);
            }
        }
        checkReport();
    });
}

function get(query) {
    return new Promise((resolve,reject)=> {
        if(!query) {
            reject('Query path is missing.');
        } else {
            keepAlive()
            .then((auth_data) => {
                request
                (
                    {
                        url: `${baseurl}/${query}`,
                        method: 'GET',
                        headers: {
                            "Authorization": auth_data.token
                        }
                    },
                    (error,response,body)=>{
                        if(error) {
                            reject(error);
                        } else {
                            resolve(body);
                        }
                    }
                );
            })
            .catch((error) => {
                reject(error);
            });
        }
    });
}

function post(query,body_text) {
    return new Promise((resolve,reject)=> {
        if(!query) {
            reject('Query path is missing.');
        } else {
            keepAlive()
            .then((auth_data) => {
                request(
                    {
                        url: `${baseurl}/${query}`,
                        method: 'POST',
                        headers: {
                            "Authorization": auth_data.token
                        },
                        body: body_text
                    },
                    (error,response,body)=>{
                        if(error) {
                            reject(error);
                        } else {
                            resolve(body);
                        }
                    }
                );
            })
            .catch((error) => {
                console.log(error);
                util.append_log('dsp-reqs.log',error);
                reject(error);
            });
        }
    });
}

function keepAlive() {
    let auth_data = JSON.parse(util.read_log('appnexus-auth.dat'));
    let retry = 0;
    return new Promise((resolve,reject) => {
        // Ensure access token is active.
        let auth_exp = (new Date(auth_data.expire_date)).getTime() - (1800 * 1000); // Advance 30 minutes ahead of expiry date.
        let date_now = (new Date((new Date()).toUTCString())).getTime();

        if(date_now > auth_exp) { // If token is expired.
            let lock_data = lockAuth();
            if(lock_data.locked) { // If there is ongoing authentication request.
                let last_run = (new Date(lock_data.last_run)).getTime();
                if((last_run + 60000) < date_now) {
                    // If last auth happened 60 seconds ago, re-authenticate.
                    util.append_log('appnexus-requests.log','Sessions has expired. Re-authenticating...');
                    authenticate().then((auth_data)=>{
                        util.append_log('appnexus-requests.log','Login success.');
                        resolve(auth_data);
                    }).catch((error)=>{
                        util.append_log('appnexus-requests.log',error);
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
                            util.append_log('appnexus-requests.log',message);
                            reject(message);
                        }
                    },1000);
                }
            } else {
                // Re-authenticate.
                authenticate().then((auth_data)=>{
                    util.append_log('appnexus-requests.log','Login success.');
                    resolve(auth_data);
                }).catch((error)=>{
                    util.append_log('appnexus-requests.log',error);
                    reject(error);
                });
            }
        } else {
            resolve(auth_data);
        }
    });
}

function lockAuth(status) {
    let lock_file = path.join(process.cwd(),'logs','appnexus-auth.lock');
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
        let username = process.env.APNX_USER;
        let password = process.env.APNX_PASS;

        if(username && password) {
            let auth_info = {
                "auth": {
                    "username": username,
                    "password": password
                }
            }
            request(
                {
                    url: `${baseurl}/auth`,
                    method: 'POST',
                    body: JSON.stringify(auth_info)
                },
                (error,response,body)=>
                {
                    lockAuth(false);
                    if(error) {
                        reject(error);
                    } else {
                        let api_res = JSON.parse(body);
                        if(!api_res.response.token) { // If access token is not present.
                            reject('DSP login failed.');
                        } else {
                            let date_now = new Date((new Date()).toUTCString());
                            let expire_date = (new Date(date_now.setTime(date_now.getTime() + (5400 * 1000)))).toISOString();
                            let auth_data = {
                                token: api_res.response.token,
                                expire_date: expire_date
                            }
                            util.write_log('appnexus-auth.dat',JSON.stringify(auth_data));
                            resolve(auth_data);
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
    get,
    post,
    getAgencySpend,
    getAdvertisers
}