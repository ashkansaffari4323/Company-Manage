const{session}=require('../../lib/_lib');module.exports=(q,s)=>s.json({authenticated:!!session(q)});
