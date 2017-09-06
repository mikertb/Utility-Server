const path       = require('path');
const express    = require('express');
const app        = express();
const appnexus   = require(path.join(__dirname,'modules','appnexus'));
const platformio = require(path.join(__dirname,'modules','platformio'));
const request    = require('request');
const util       = require(path.join(__dirname,'helpers','utility.js'));

app.listen(8080,()=>{
    console.log("Utility server started at port: 8080");
});

app.use('/logs', express.static('logs'))

app.get('/platformio-report/agency-spend',(req,res)=>{
    let error_res = {
        status: 500,
        message: 'Agency ID is required.'
    }
    if(req.query.id) {
        if(/^[0-9]+$/.test(req.query.id)) {
            platformio.getAgencySpend(req.query.id)
            .then((data) => {
                try{
                    res.json(data);
                } catch(error) {
                    error_res.message = "Internal server error.";
                    res.json(error_res);
                }
            })
            .catch((error)=>{
                console.log(error);
                error_res.message = error;
                res.json(error_res);
            });
        } else {
            res.json(error_res);
        }
    } else {
        res.json(error_res);
    }
});

app.get('/appnexus-report/agency-spend',(req,res)=>{
    let error_res = {
        status: 500,
        message: 'Agency ID is required.'
    }
    if(req.query.id) {
        if(/^[0-9]+$/.test(req.query.id)) {

            let interval = "month_to_date";
            if(req.query.interval) interval = req.query.interval;

            appnexus.getAgencySpend(req.query.id,interval)
            .then((data) => {
                try{
                    res.json(data);
                } catch(error) {
                    console.log(error);
                    error_res.message = 'Internal server error.';
                    res.json(error_res);
                }
            })
            .catch((error)=>{
                error_res.message = error;
                res.json(error_res);
            });
        } else {
            error_res.message = "Agency ID is invalid.";
            res.json(error_res);
        }
    } else {
        res.json(error_res);
    }
});
