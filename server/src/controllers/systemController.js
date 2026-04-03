const fs = require('fs');
const path = require('path');

exports.getDeploymentInfo = async (req, res) => {
  const root = path.resolve(__dirname, '../../..');
  const offlineMode = ['true', '1', 'yes'].includes(String(process.env.OFFLINE_MODE || process.env.NO_CLOUD_MODE || '').toLowerCase());

  const files = {
    clientDockerfile: fs.existsSync(path.join(root, 'client', 'Dockerfile')),
    serverDockerfile: fs.existsSync(path.join(root, 'server', 'Dockerfile')),
    mlDockerfile: fs.existsSync(path.join(root, 'ml_service', 'Dockerfile')),
    dockerCompose: fs.existsSync(path.join(root, 'docker-compose.yml')),
    kubernetes: fs.existsSync(path.join(root, 'k8s')),
  };

  res.json({
    offlineMode,
    noCloudMode: offlineMode,
    trainingMode: offlineMode ? 'local-only' : 'local-first',
    inferenceMode: offlineMode ? 'local-only' : 'local-first',
    dockerSupport: files.clientDockerfile && files.serverDockerfile && files.mlDockerfile && files.dockerCompose,
    kubernetesSupport: files.kubernetes,
    artifacts: files,
  });
};
