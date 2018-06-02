const http = require("http");
const https = require("https");
const express = require("express");
const mysql = require("mysql");
const bodyParser = require("body-parser");
const fs = require('fs');

const config = require("./config");

const app = express();
app.use(bodyParser.json());

const pool = mysql.createPool({
    host: "localhost",
    port: 3306,
    database: "fragment",
    user: "fragment",
    password: "TangCuLiJi&123"
});

const repo = "./notebooks/";

function showMissingArgs(res,field) {
    res.statusCode = 400;
    res.json({error:"MISSING_ARGS",data:field});
    res.end();
}

function checkFields(req,res,fields){
    let params = req.body;
    let key = "all";
l0: if (params !== undefined) {
        for (var field in fields) {
            if (fields.hasOwnProperty(field) && params[fields[field]] === undefined) {
                key = fields[field];
                break l0;
            }
        }
        return params;
    }
    showMissingArgs(res, key);
    return null;
}

function checkUserId(res,userId){
    if (!/\w{28,32}/.exec(userId)) {
        res.statusCode = 400;
        res.json({error:"INVALID_USERID"});
        res.end();
        return false;
    }
    return true;
}

function notebookName(userId) {
    return repo + userId + ".txt";
}

// POST /login      code->openid
app.post("/fake_login", (req, res)=>{
    res.statusCode = 200;
    res.json({id: "0000000000000000000000000000"}); //28个
    res.end();
});

// 真的 POST /login
app.post("/login",(req, res)=>{
    if (checkFields(req, res, ["code"])) {
        https.get(
            "https://api.weixin.qq.com/sns/jscode2session?appid=" + config.app_id +
            "&secret=" + config.app_secret +
            "&grant_type=authorization_code&js_code=" + req.body.code,
            function (wx_res) {
                wx_res.on('data', function (data) {
                    const response = JSON.parse(data.toString());
                    switch (response.errcode) {
                    case 0:
                        res.statusCode = 200;
                        res.json({id: "0000000000000000000000000000"});
                        res.end();
                        break;
                    case 40029:
                        res.statusCode = 401;
                        res.json({id: "",msg:"INVALID_CODE"});
                        res.end();
                        break;
                    default:
                        res.statusCode = 401;
                        res.json({id: "",msg:"LOGIN_FAILED",code:response.errcode});
                        res.end();
                        break;
                    }
                });
            });
    }
});

// PUT /history            openid,word->记录数据库
app.put("/history", (req, res)=>{
    let params = checkFields(req,res, ["userId", "word"]);
    if (params !== null && checkUserId(res,params.userId)) {
        pool.query("SELECT history FROM history WHERE user_id = ?", [params.userId], (error, results, fields)=>{
            if (error) {
                console.log(error);
                res.statusCode = 500;
                res.end();
                return;
            }
            let result_list = results.length === 0 ? [] : results[0]["history"].split("|");
            var index;
            if ((index = result_list.findIndex((value, index, obj)=>(value === params.word))) !== -1) {
                result_list.splice(index, 1);
            }
            result_list.unshift(params.word);
            let result = result_list.slice(0,7).join('|');
            pool.query("REPLACE INTO history(user_id, history) values(?,?)", [params.userId, result],
                (error, results, fields)=> {
                    if (error) {
                        console.log(error);
                        res.statusCode = 500;
                        res.end();
                        return;
                    }
                    res.statusCode = 201;
                    res.json({msg: "created"});
                    res.end();
            });
        });
    }
});

// POST /history             openid->数据库内历史记录
app.post("/history", (req, res)=>{
    let params = checkFields(req,res, ["userId"]);
    if (params !== null && checkUserId(res,params.userId)) {
        pool.query("SELECT history FROM history WHERE user_id = ?", [params.userId], (error, results, fields)=>{
            if (error) {
                console.log(error);
                res.statusCode = 500;
                res.end();
                return;
            }
            let result_list = results.length === 0 ? [] : results[0]["history"].split("|");
            res.statusCode = 200;
            res.json(result_list);
            res.end();
        });
    }
});

// POST /notebooks           openid->获得单词本内生词列表
app.post("/notebooks", (req,res)=>{
    let params = checkFields(req,res, ["userId"]);
    if (params !== null && checkUserId(res,params.userId)) {
        let notebook = notebookName(params.userId);
        fs.readFile(repo + notebook, (error, data)=>{
            if (error) {
                if (error.code === "ENOENT") { // 未找到
                    res.statusCode = 200;
                    res.json([]);
                    res.end();
                } else {
                    console.log(error);
                    res.statusCode = 500;
                    res.end();
                }
            } else {
                res.statusCode = 200;
                res.json(data.split('\n'));
                res.end();
            }
        });
    }
});

// PUT /notebooks/:word     openid->记录单词进入生词本
app.put("/notebooks/:word", (req,res)=>{
    let params = checkFields(req,res, ["userId"]);
    if (params !== null && checkUserId(res,params.userId)) {
        let notebook = notebookName(params.userId);
        fs.readFile(notebook, (error, data)=>{
            var words;
            if (error) {
                if (error.code === "ENOENT") {
                    words = [];
                } else {
                    console.log(error);
                    res.statusCode = 500;
                    res.end();
                    return;
                }
            } else {
                words = data.toString().split('\n');
                var index;
                if ((index = words.findIndex((value, index, obj)=>(value === req.params.word))) !== -1) {
                    res.statusCode = 201;
                    res.json({msg: "created"});
                    res.end();
                    return;
                }
            }
            words.push(req.params.word);
            fs.writeFile(notebook, words.join('\n'), (error)=>{
                if (error) {
                    console.log(error);
                    res.statusCode = 500;
                    res.end();
                    return;
                }
                res.statusCode = 201;
                res.json({msg: "created"});
                res.end();
            });
        });
    }
});

// POST /notebooks/delete/:word
app.post("/notebooks/delete/:word", (req,res)=>{
    let params = checkFields(req,res, ["userId"]);
    if (params !== null && checkUserId(res,params.userId)) {
        let notebook = notebookName(params.userId);
        fs.readFile(notebook, (error, data)=>{
            if (error) {
                if (error.code === "ENOENT") {
                    res.statusCode = 204;
                    res.json({msg:"not found"});
                    res.end();
                    return;
                }
                console.log(error);
                res.statusCode = 500;
                res.end();
                return;
            }
            let words = data.toString().split('\n');
            words.splice(words.findIndex((value, index, obj)=>(value === params.word)), 1);
            fs.writeFile(notebook, words.join('\n'), (error)=>{
                if (error) {
                    console.log(error);
                    res.statusCode = 500;
                    res.end();
                } else {
                    res.statusCode = 204;
                    res.json({msg: "no content"});
                    res.end();
                }
            });
        });
    }
});

// POST /notebooks/exist/:word     openid->指定单词是否处于单词本中
app.post("/notebooks/exist/:word", (req,res)=>{
    let params = checkFields(req,res, ["userId"]);
    if (params !== null && checkUserId(res,params.userId)) {
        let notebook = notebookName(params.userId);
        fs.readFile(notebook, (error, data)=>{
            if (error) {
                console.log(error);
                res.statusCode = 500;
                res.end();
                return;
            }
            let words = data.toString().split('\n');
            res.statusCode = 200;
            res.json({found:words.findIndex(value=>value===req.params.word) !== -1,data:req.params.word});
            res.end();
        });
    }
});

app.get("/doc", (req,res)=>{
    res.redirect(302, "https://github.com/ligonggan/frag-backend/tree/master/test");
});

app.all("/*", (req,res)=>{
    res.statusCode = 400;
    res.json({error:"NO_SUCH_API"});
    res.end();
});

http.createServer(app).listen(3001, function(){
    console.log('Express server listening on port 3001');
});
