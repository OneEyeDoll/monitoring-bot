const {getTaskData, findGitHubIssue, findClaimUrl, laurelsMap, volunteersMap} = require("./thelaurel");

function watch (callback, milliseconds) {
  const intervalId = setInterval(callback, milliseconds);
  return () => clearInterval(intervalId);
}

async function watchEvent (web3, thelaurel, name, lastBlock, callback, milliseconds = 60000) {
  lastBlock = lastBlock || (await web3.provider.getBlockNumber());
  console.log('---- monitor watchEvent', name, lastBlock);
  return watch(async () => {
    console.log('monitor lastBlock', lastBlock);
    const events = await thelaurel.queryFilter(name, lastBlock);
    
    console.log('events', events.length);
    // console.log('monitor events', events);
    for (const ev of events) {
      console.log('block', ev.blockNumber);
      if (ev.blockNumber > lastBlock) await callback(ev);
    }
    if (events.length > 0) {
      lastBlock = Math.max(lastBlock, events[events.length - 1].blockNumber);
    }
  }, milliseconds);
}

function watchTasks (web3, thelaurel, lastBlock, callback, milliseconds) {
  console.log('---- monitor watchTasks');
  return watchEvent(web3, thelaurel, 'RegisterTask', lastBlock, callback, milliseconds);
}

function watchClaims (web3, thelaurel, lastBlock, callback, milliseconds) {
  console.log('---- monitor watchClaims');
  return watchEvent(web3, thelaurel, 'RegisterOption', lastBlock, callback, milliseconds);
}

function watchVotes (web3, thelaurel, lastBlock, callback, milliseconds) {
  console.log('---- monitor watchClaims');
  return watchEvent(web3, thelaurel, 'Voted', lastBlock, callback, milliseconds);
}

async function monitor (web3, thelaurel, lastBlock, callbacks, milliseconds = 5000) {
  console.log('*****monitor START*****')
  const unsubscribeTasks = await watchTasks(web3, thelaurel, lastBlock, async (taskEvent) => {
    const taskid = taskEvent.args.taskid;
    console.log('monitor taskid', taskid);
    const task = await getTaskData(taskid);
    console.log('monitor task', task);
    const gitHubIssue = await findGitHubIssue(taskid);
    const data = {
      ...task,
      laurelid: task.task.laurelid,
      laurel: laurelsMap[task.task.laurelid],
      organizerData: volunteersMap[task.task.organizer],
      beneficiaryData: volunteersMap[task.beneficiary] || task.beneficiary,
      gitHubIssue,
      transactionHash: taskEvent.transactionHash,
    }
    callbacks.onTaskRegistered(data);
  }, milliseconds);
  
  const unsubscribeClaims = await watchClaims(web3, thelaurel, lastBlock, async (taskEvent) => {
    // event RegisterOption(bytes32 indexed taskid, bytes32 optionid, uint256 optionIndex);
    const {taskid, optionid, optionIndex} = taskEvent.args;
    console.log('monitor claim: taskid', taskid, optionIndex);
    const task = await getTaskData(taskid);
    const gitHubIssue = await findGitHubIssue(taskid);
    const optionUrl = await findClaimUrl(gitHubIssue, optionid);
    const data = {
      taskid,
      optionid,
      optionIndex,
      // ...task,
      laurelid: task.task.laurelid,
      laurel: laurelsMap[task.task.laurelid],
      beneficiaryData: volunteersMap[task.beneficiary] || task.beneficiary,
      gitHubIssue,
      optionUrl,
      transactionHash: taskEvent.transactionHash,
    }
    callbacks.onClaim(data);
  }, milliseconds);
  
  const unsubscribeVotes = await watchVotes(web3, thelaurel, lastBlock, async (taskEvent) => {
    // event Voted(bytes32 indexed taskid, uint256 optionIndex, uint256 WL, uint256 AL, uint256 weight);
    const {taskid, optionIndex, WL, AL, weight} = taskEvent.args;
    console.log('monitor vote: taskid', taskid, optionIndex);
    const task = await getTaskData(taskid);
    const gitHubIssue = await findGitHubIssue(taskid);
    const receipt = await web3.provider.getTransactionReceipt(taskEvent.transactionHash);
    const data = {
      taskid,
      optionIndex,
      WL, AL, weight,
      ...task,
      laurelid: task.task.laurelid,
      laurel: laurelsMap[task.task.laurelid],
      gitHubIssue,
      voterData: volunteersMap[receipt.from] || receipt.from,
      transactionHash: taskEvent.transactionHash,
    }
    callbacks.onVote(data);
  }, milliseconds);
  
  return [unsubscribeTasks, unsubscribeClaims, unsubscribeVotes];
}

module.exports = {
  monitor,
  watchTasks,
  watchEvent,
  watch,
}
