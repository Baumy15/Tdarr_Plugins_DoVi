"use strict";

Object.defineProperty(exports, "__esModule", { value: true });
exports.plugin = exports.details = void 0;

const details = () => ({
    name: 'Keep Specific Audio Stream (Flow)',
    description: 'Preserves only one audio stream based on codec/channel/language, removes all others. Preserves video, subtitle, Dolby Vision, and metadata streams.',
    style: { borderColor: 'green' },
    tags: 'audio,filter,remux,dolby-vision',
    isStartPlugin: false,
    pType: '',
    requiresVersion: '2.11.01',
    sidebarPosition: -1,
    icon: 'faVolumeUp',
    inputs: [
        {
            label: 'Target Codec',
            name: 'targetCodec',
            type: 'string',
            defaultValue: 'eac3',
            inputUI: { type: 'text' },
            tooltip: 'Audio codec to keep (e.g., eac3, ac3, aac, dts, truehd)',
        },
        {
            label: 'Target Channels',
            name: 'targetChannels',
            type: 'number',
            defaultValue: 6,
            inputUI: { type: 'text' },
            tooltip: 'Number of channels to keep (e.g., 2 = stereo, 6 = 5.1, 8 = 7.1)',
        },
        {
            label: 'Target Language',
            name: 'targetLanguage',
            type: 'string',
            defaultValue: 'eng',
            inputUI: { type: 'text' },
            tooltip: 'ISO 639-2 code (e.g., eng, jpn). Leave blank to ignore.',
        },
        {
            label: 'Debug Mode',
            name: 'debugMode',
            type: 'boolean',
            defaultValue: false,
            inputUI: { type: 'switch' },
            tooltip: 'Enable debug logs',
        },
    ],
    outputs: [
        {
            number: 1,
            tooltip: 'Continue to next plugin',
        },
    ],
});
exports.details = details;

const plugin = (args) => {
    const lib = require('../../../../../methods/lib')();
    args.inputs = lib.loadDefaultValues(args.inputs, details);

    const { targetCodec, targetChannels, targetLanguage, debugMode } = args.inputs;
    const { ffProbeData } = args.inputFileObj;

    const log = (msg) => {
        if (debugMode) args.jobLog(`[AudioFilter] ${msg}`);
    };

    if (!ffProbeData || !ffProbeData.streams) {
        args.jobLog('No stream data found');
        return {
            outputFileObj: args.inputFileObj,
            outputNumber: 1,
            variables: args.variables,
        };
    }

    const normalizeCodec = (codec) => {
        const map = {
            dca: 'dts',
            'eac-3': 'eac3',
            ac3: 'ac3',
            mlp: 'truehd',
            pcm_s16le: 'pcm',
            pcm_s24le: 'pcm',
        };
        return map[codec] || codec;
    };

    const audioStreams = ffProbeData.streams.filter((s) => s.codec_type === 'audio');
    if (audioStreams.length <= 1) {
        args.jobLog('One or zero audio streams, skipping');
        return {
            outputFileObj: args.inputFileObj,
            outputNumber: 1,
            variables: args.variables,
        };
    }

    let selectedStream = null;
    for (const stream of audioStreams) {
        const codec = normalizeCodec(stream.codec_name);
        const lang = stream.tags?.language?.toLowerCase();
        const channels = stream.channels || 0;
        const matches =
            codec === targetCodec.toLowerCase() &&
            (!targetChannels || channels === targetChannels) &&
            (!targetLanguage || (lang && lang === targetLanguage.toLowerCase()));
        if (matches) {
            selectedStream = stream;
            break;
        }
    }

    if (!selectedStream) {
        args.jobLog('No matching audio stream found');
        return {
            outputFileObj: args.inputFileObj,
            outputNumber: 1,
            variables: args.variables,
        };
    }

    const selectedIndex = selectedStream.index;
    args.jobLog(`Selected audio stream: ${selectedIndex} (${selectedStream.codec_name}, ${selectedStream.channels}ch, ${selectedStream.tags?.language || 'unknown'})`);

    // Remove only other audio streams — keep all others (video, subtitles, data)
    args.variables.ffmpegCommand.streams.forEach((stream) => {
        if (stream.codec_type === 'audio' && stream.index !== selectedIndex) {
            stream.removed = true;
        } else {
            stream.removed = false;
        }
    });

    // Add output args to preserve DV and metadata
    args.variables.ffmpegCommand.shouldProcess = true;
    args.variables.ffmpegCommand.overallOuputArguments = args.variables.ffmpegCommand.overallOuputArguments || [];

    args.variables.ffmpegCommand.overallOuputArguments.push(
        '-map_metadata', '0',
        '-map_chapters', '0',
        '-disposition:a:0', 'default',
        '-movflags', '+faststart',
        '-strict', '-2'
    );

    return {
        outputFileObj: args.inputFileObj,
        outputNumber: 1,
        variables: args.variables,
    };
};
exports.plugin = plugin;