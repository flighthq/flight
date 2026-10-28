import { addLogSink, createConsoleLogSink, createLogState, logInfo } from '@flighthq/log';

const logState = createLogState();
addLogSink(logState, createConsoleLogSink(logState));
logInfo(logState, performance.now(), 'ready', 'size');
