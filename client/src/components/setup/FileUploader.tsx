import { useState, useEffect } from 'react';

// ============================================================================
// Types
// ============================================================================

interface PacketInfo {
  id: string;
  name: string;
  tossupFile: string;
  bonusFile?: string;
  tossupCount?: number;
  bonusCount?: number;
}

interface ModelInfo {
  name: string;
  hasTossupResponses: boolean;
  hasBonusResponses: boolean;
}

interface RosterPlayer {
  player_id: string;
  name: string;
  type: 'ai' | 'human';
  tossup_model?: string;
  bonus_model?: string;
}

interface ValidationIssue {
  type: 'error' | 'warning';
  message: string;
  details?: string;
}

interface Dataset {
  id: string;
  name: string;
  path: string;
  type: 'simple' | 'tournament';
  hasTossups: boolean;
  hasBonuses: boolean;
  tossupFile?: string;
  bonusFile?: string;
  packets?: PacketInfo[];
  responsesDir?: string;
  models: ModelInfo[];
  hasAiRoster: boolean;
  hasHumanRoster: boolean;
  aiPlayers?: RosterPlayer[];
  humanPlayers?: RosterPlayer[];
  validationIssues: ValidationIssue[];
  isValid: boolean;
}

interface FileUploaderProps {
  files: {
    tossupFile: string;
    bonusFile: string;
    modelDirectory: string;
  };
  onChange: (files: {
    tossupFile: string;
    bonusFile: string;
    modelDirectory: string;
  }, models?: string[], datasetId?: string) => void;
}

// ============================================================================
// Help Tooltip Component
// ============================================================================

function HelpTooltip({ title, children }: { title: string; children: React.ReactNode }) {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <div className="relative inline-block">
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="ml-2 w-5 h-5 rounded-full bg-gray-200 text-gray-600 text-xs font-bold hover:bg-gray-300 transition-colors"
        title="Click for help"
      >
        ?
      </button>
      {isOpen && (
        <>
          <div
            className="fixed inset-0 z-40"
            onClick={() => setIsOpen(false)}
          />
          <div className="absolute left-0 top-8 z-50 w-80 bg-white border border-gray-200 rounded-lg shadow-lg p-4">
            <div className="flex justify-between items-start mb-2">
              <h4 className="font-semibold text-gray-800">{title}</h4>
              <button
                onClick={() => setIsOpen(false)}
                className="text-gray-400 hover:text-gray-600"
              >
                ✕
              </button>
            </div>
            <div className="text-sm text-gray-600">{children}</div>
          </div>
        </>
      )}
    </div>
  );
}

// ============================================================================
// Validation Badge Component
// ============================================================================

function ValidationBadge({ issues }: { issues: ValidationIssue[] }) {
  const errors = issues.filter(i => i.type === 'error');
  const warnings = issues.filter(i => i.type === 'warning');

  if (errors.length === 0 && warnings.length === 0) {
    return (
      <span className="inline-flex items-center gap-1 text-xs text-green-600 bg-green-50 px-2 py-1 rounded-full">
        ✓ Valid
      </span>
    );
  }

  return (
    <div className="flex gap-2">
      {errors.length > 0 && (
        <span className="inline-flex items-center gap-1 text-xs text-red-600 bg-red-50 px-2 py-1 rounded-full">
          ✕ {errors.length} error{errors.length !== 1 ? 's' : ''}
        </span>
      )}
      {warnings.length > 0 && (
        <span className="inline-flex items-center gap-1 text-xs text-yellow-600 bg-yellow-50 px-2 py-1 rounded-full">
          ⚠ {warnings.length} warning{warnings.length !== 1 ? 's' : ''}
        </span>
      )}
    </div>
  );
}

// ============================================================================
// Main Component
// ============================================================================

export function FileUploader({ files, onChange }: FileUploaderProps) {
  const [datasets, setDatasets] = useState<Dataset[]>([]);
  const [selectedDataset, setSelectedDataset] = useState<Dataset | null>(null);
  const [selectedPacket, setSelectedPacket] = useState<PacketInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [mode, setMode] = useState<'browse' | 'manual'>('browse');
  const [showHelp, setShowHelp] = useState(false);

  // Load available datasets on mount
  useEffect(() => {
    loadDatasets();
  }, []);

  const loadDatasets = async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch('/api/datasets/list');
      if (!response.ok) throw new Error('Failed to load datasets');
      const data = await response.json();
      setDatasets(data.datasets || []);
    } catch (err) {
      setError('Could not load datasets from server. You can enter paths manually.');
      setMode('manual');
    } finally {
      setLoading(false);
    }
  };

  const handleDatasetSelect = (dataset: Dataset) => {
    setSelectedDataset(dataset);
    setSelectedPacket(null);

    // For tournament datasets, don't auto-select files until packet is chosen
    if (dataset.type === 'tournament' && dataset.packets && dataset.packets.length > 0) {
      // Auto-select first packet
      handlePacketSelect(dataset, dataset.packets[0]);
    } else {
      // Simple dataset - use the single tossup/bonus files
      onChange(
        {
          tossupFile: dataset.tossupFile || '',
          bonusFile: dataset.bonusFile || '',
          modelDirectory: dataset.responsesDir || '',
        },
        dataset.models.map(m => m.name),
        dataset.id
      );
    }
  };

  const handlePacketSelect = (dataset: Dataset, packet: PacketInfo) => {
    setSelectedPacket(packet);
    onChange(
      {
        tossupFile: packet.tossupFile,
        bonusFile: packet.bonusFile || '',
        modelDirectory: dataset.responsesDir || '',
      },
      dataset.models.map(m => m.name),
      dataset.id
    );
  };

  const handleFileUpload = async (
    event: React.ChangeEvent<HTMLInputElement>,
    field: 'tossupFile' | 'bonusFile'
  ) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setError(null);

    try {
      const formData = new FormData();
      formData.append('file', file);

      const response = await fetch('/api/files/upload', {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        throw new Error('Upload failed');
      }

      const result = await response.json();
      onChange({
        ...files,
        [field]: result.path,
      });
    } catch (err) {
      setError(`Failed to upload: ${err}`);
    }
  };

  const handleDirectPathInput = (field: keyof typeof files, value: string) => {
    onChange({
      ...files,
      [field]: value,
    });
  };

  if (loading) {
    return (
      <div className="text-center py-8">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto mb-4" />
        <p className="text-gray-500">Loading available datasets...</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header with help */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <h3 className="font-semibold text-gray-700">Select Game Data</h3>
          <HelpTooltip title="Dataset Structure">
            <div className="space-y-2">
              <p><strong>Simple format:</strong> Single folder with tossups.csv, bonuses.csv, and responses/</p>
              <p><strong>Tournament format:</strong> Folder with packet_1/, packet_2/, etc. plus responses/ and roster files</p>
              <p className="mt-2 pt-2 border-t border-gray-200">
                <a 
                  href="/api/datasets/help/structure" 
                  target="_blank" 
                  className="text-blue-600 hover:underline"
                >
                  View full documentation →
                </a>
              </p>
            </div>
          </HelpTooltip>
        </div>
        <button
          onClick={() => setShowHelp(!showHelp)}
          className="text-sm text-blue-600 hover:text-blue-800"
        >
          {showHelp ? 'Hide' : 'Show'} structure guide
        </button>
      </div>

      {/* Structure Guide */}
      {showHelp && (
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
          <h4 className="font-semibold text-blue-800 mb-2">Expected Directory Structure</h4>
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <p className="font-medium text-blue-700 mb-1">Simple Format</p>
              <pre className="bg-blue-100 rounded p-2 text-xs overflow-x-auto">
{`dataset_name/
├── tossups.csv
├── bonuses.csv (optional)
└── responses/
    ├── model.buzz.csv
    └── model.bonus.csv`}
              </pre>
            </div>
            <div>
              <p className="font-medium text-blue-700 mb-1">Tournament Format</p>
              <pre className="bg-blue-100 rounded p-2 text-xs overflow-x-auto">
{`tournament/
├── ai_roster.csv
├── human_roster.csv
├── packet_1/
│   ├── tossups.csv
│   └── bonuses.csv
│   ├── img/
│   └── audio/
└── responses/
    └── Author__model.buzz.csv`}
              </pre>
            </div>
          </div>
          <p className="text-xs text-blue-600 mt-2">
            AI roster model names must match response filenames (e.g., "Author__model" → "Author__model.buzz.csv")
          </p>
        </div>
      )}

      {error && (
        <div className="bg-yellow-50 border border-yellow-200 text-yellow-700 p-3 rounded-lg">
          <strong>Note:</strong> {error}
        </div>
      )}

      {/* Mode toggle */}
      <div className="flex gap-2 border-b pb-4">
        <button
          onClick={() => setMode('browse')}
          className={`px-4 py-2 rounded-lg font-medium transition-colors ${
            mode === 'browse'
              ? 'bg-blue-600 text-white'
              : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
          }`}
        >
          📂 Browse Datasets
        </button>
        <button
          onClick={() => setMode('manual')}
          className={`px-4 py-2 rounded-lg font-medium transition-colors ${
            mode === 'manual'
              ? 'bg-blue-600 text-white'
              : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
          }`}
        >
          ✏️ Manual Input
        </button>
      </div>

      {mode === 'browse' && (
        <div className="space-y-4">
          {datasets.length === 0 ? (
            <div className="text-center py-8 bg-gray-50 rounded-lg">
              <p className="text-gray-500 mb-2">No datasets found on the server.</p>
              <p className="text-sm text-gray-400 mb-4">
                Place dataset folders in the <code className="bg-gray-200 px-1 rounded">data/tourney/</code> directory
              </p>
              <button
                onClick={() => setMode('manual')}
                className="text-blue-600 hover:text-blue-800 text-sm"
              >
                Enter paths manually →
              </button>
            </div>
          ) : (
            <div className="grid gap-3">
              {datasets.map((dataset) => (
                <div
                  key={dataset.id}
                  className={`rounded-lg border-2 transition-all ${
                    selectedDataset?.id === dataset.id
                      ? 'border-blue-500 bg-blue-50'
                      : 'border-gray-200 hover:border-blue-300'
                  }`}
                >
                  {/* Dataset header */}
                  <button
                    onClick={() => handleDatasetSelect(dataset)}
                    className="w-full text-left p-4"
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <h4 className="font-semibold text-gray-800">{dataset.name}</h4>
                          <span className={`text-xs px-2 py-0.5 rounded ${
                            dataset.type === 'tournament' 
                              ? 'bg-purple-100 text-purple-700' 
                              : 'bg-gray-100 text-gray-600'
                          }`}>
                            {dataset.type === 'tournament' ? '🏆 Tournament' : '📋 Simple'}
                          </span>
                        </div>
                        <div className="flex flex-wrap gap-3 mt-1 text-sm text-gray-500">
                          {dataset.type === 'tournament' && dataset.packets && (
                            <span>📦 {dataset.packets.length} packets</span>
                          )}
                          {dataset.hasTossups && <span>📝 Tossups</span>}
                          {dataset.hasBonuses && <span>🎯 Bonuses</span>}
                          {dataset.models.length > 0 && (
                            <span>🤖 {dataset.models.length} models</span>
                          )}
                          {dataset.hasAiRoster && (
                            <span>👾 {dataset.aiPlayers?.length || 0} AI players</span>
                          )}
                          {dataset.hasHumanRoster && (
                            <span>👤 {dataset.humanPlayers?.length || 0} humans</span>
                          )}
                        </div>
                      </div>
                      <div className="flex flex-col items-end gap-2">
                        {selectedDataset?.id === dataset.id && (
                          <span className="text-blue-600 text-lg">✓</span>
                        )}
                        <ValidationBadge issues={dataset.validationIssues} />
                      </div>
                    </div>
                  </button>

                  {/* Expanded content for selected dataset */}
                  {selectedDataset?.id === dataset.id && (
                    <div className="border-t border-blue-200 p-4 bg-white rounded-b-lg">
                      {/* Validation issues */}
                      {dataset.validationIssues.length > 0 && (
                        <div className="mb-4 space-y-2">
                          {dataset.validationIssues.map((issue, idx) => (
                            <div
                              key={idx}
                              className={`p-3 rounded-lg text-sm ${
                                issue.type === 'error'
                                  ? 'bg-red-50 border border-red-200'
                                  : 'bg-yellow-50 border border-yellow-200'
                              }`}
                            >
                              <div className={`font-medium ${
                                issue.type === 'error' ? 'text-red-700' : 'text-yellow-700'
                              }`}>
                                {issue.type === 'error' ? '✕' : '⚠'} {issue.message}
                              </div>
                              {issue.details && (
                                <div className={`mt-1 text-xs ${
                                  issue.type === 'error' ? 'text-red-600' : 'text-yellow-600'
                                }`}>
                                  {issue.details}
                                </div>
                              )}
                            </div>
                          ))}
                        </div>
                      )}

                      {/* Packet selector for tournaments */}
                      {dataset.type === 'tournament' && dataset.packets && (
                        <div className="mb-4">
                          <label className="block text-sm font-medium text-gray-700 mb-2">
                            Select Packet
                          </label>
                          <div className="flex flex-wrap gap-2">
                            {dataset.packets.map((packet) => (
                              <button
                                key={packet.id}
                                onClick={() => handlePacketSelect(dataset, packet)}
                                className={`px-3 py-2 rounded-lg text-sm transition-colors ${
                                  selectedPacket?.id === packet.id
                                    ? 'bg-blue-600 text-white'
                                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                                }`}
                              >
                                {packet.name}
                                <span className="ml-1 text-xs opacity-75">
                                  ({packet.tossupCount}T{packet.bonusCount ? `/${packet.bonusCount}B` : ''})
                                </span>
                              </button>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Available models */}
                      {dataset.models.length > 0 && (
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-2">
                            Available AI Models
                          </label>
                          <div className="flex flex-wrap gap-2">
                            {dataset.models.map((model) => (
                              <span
                                key={model.name}
                                className="inline-flex items-center gap-1 text-xs bg-gray-100 px-2 py-1 rounded"
                                title={`Tossup: ${model.hasTossupResponses ? '✓' : '✕'}, Bonus: ${model.hasBonusResponses ? '✓' : '✕'}`}
                              >
                                {model.name}
                                <span className="text-gray-400">
                                  {model.hasTossupResponses && '📝'}
                                  {model.hasBonusResponses && '🎯'}
                                </span>
                              </span>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Selected files summary */}
                      {files.tossupFile && (
                        <div className="mt-4 pt-4 border-t border-gray-200">
                          <p className="text-sm text-gray-600">
                            <strong>Selected:</strong>
                          </p>
                          <ul className="text-xs text-gray-500 mt-1 space-y-1">
                            <li>📝 {files.tossupFile.split('/').pop()}</li>
                            {files.bonusFile && <li>🎯 {files.bonusFile.split('/').pop()}</li>}
                            {files.modelDirectory && <li>🤖 {files.modelDirectory.split('/').pop()}/</li>}
                          </ul>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {mode === 'manual' && (
        <div className="space-y-6">
          <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
            <p className="text-sm text-gray-600 mb-2">
              Enter server-side file paths. These must be paths accessible by the server.
            </p>
            <p className="text-xs text-gray-500">
              For cloud deployments, use file upload or pre-load datasets in the data directory.
            </p>
          </div>

          {/* Tossup file */}
          <div>
            <div className="flex items-center mb-1">
              <label className="label mb-0">
                <span className="text-lg">📝</span> Tossup Questions (CSV) *
              </label>
              <HelpTooltip title="Tossup File">
                <p>CSV file with columns: question_id, text, answer</p>
                <p className="mt-1 text-xs">Optional: answers (JSON array), answerline, category</p>
              </HelpTooltip>
            </div>
            <div className="flex gap-2">
              <input
                type="text"
                value={files.tossupFile}
                onChange={(e) => handleDirectPathInput('tossupFile', e.target.value)}
                placeholder="e.g., /data/tourney/offline-0614/packet_1/tossups.csv"
                className="input flex-1"
              />
              <label className="btn btn-secondary cursor-pointer">
                Upload
                <input
                  type="file"
                  accept=".csv,.json,.jsonl"
                  onChange={(e) => handleFileUpload(e, 'tossupFile')}
                  className="hidden"
                />
              </label>
            </div>
          </div>

          {/* Bonus file */}
          <div>
            <div className="flex items-center mb-1">
              <label className="label mb-0">
                <span className="text-lg">🎯</span> Bonus Questions (CSV)
              </label>
              <HelpTooltip title="Bonus File">
                <p>CSV file with columns: question_id, leadin, part1, answer1, part2, answer2, part3, answer3</p>
                <p className="mt-1 text-xs">Optional: answerline1/2/3, category</p>
              </HelpTooltip>
            </div>
            <div className="flex gap-2">
              <input
                type="text"
                value={files.bonusFile}
                onChange={(e) => handleDirectPathInput('bonusFile', e.target.value)}
                placeholder="e.g., /data/tourney/offline-0614/packet_1/bonuses.csv (optional)"
                className="input flex-1"
              />
              <label className="btn btn-secondary cursor-pointer">
                Upload
                <input
                  type="file"
                  accept=".csv,.json,.jsonl"
                  onChange={(e) => handleFileUpload(e, 'bonusFile')}
                  className="hidden"
                />
              </label>
            </div>
          </div>

          {/* Model directory */}
          <div>
            <div className="flex items-center mb-1">
              <label className="label mb-0">
                <span className="text-lg">🧠</span> Model Responses Directory *
              </label>
              <HelpTooltip title="Responses Directory">
                <p>Directory containing AI response files:</p>
                <ul className="mt-1 text-xs list-disc list-inside">
                  <li><code>model.buzz.csv</code> - Tossup responses</li>
                  <li><code>model.bonus.csv</code> - Bonus responses</li>
                </ul>
                <p className="mt-2 text-xs">File names must match model names in ai_roster.csv</p>
              </HelpTooltip>
            </div>
            <input
              type="text"
              value={files.modelDirectory}
              onChange={(e) => handleDirectPathInput('modelDirectory', e.target.value)}
              placeholder="e.g., /data/tourney/offline-0614/responses"
              className="input"
            />
          </div>
        </div>
      )}
    </div>
  );
}
