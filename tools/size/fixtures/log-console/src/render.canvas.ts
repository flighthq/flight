import { addLogSink, createConsoleLogSink, logInfo } from '@flighthq/log';

addLogSink(createConsoleLogSink());
logInfo('ready', 'size');
