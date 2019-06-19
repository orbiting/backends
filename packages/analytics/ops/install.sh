export DEBIAN_FRONTEND=noninteractive
sudo apt update
# avoid interactive questions during upgrade
sudo apt-mark hold grub-pc
sudo apt-mark hold grub-common
# https://serverfault.com/questions/645566/a-new-version-of-boot-grub-menu-lst-is-available-when-upgrading-ubuntu-on-an
sudo rm /boot/grub/menu.lst
# Generate a new configuration file.
sudo update-grub-legacy-ec2 -y
sudo apt upgrade -yq
# docker
sudo apt-get install -yq \
  apt-transport-https \
  ca-certificates \
  curl \
  gnupg-agent \
  software-properties-common
curl -fsSL https://download.docker.com/linux/ubuntu/gpg | sudo apt-key add -
sudo add-apt-repository \
   "deb [arch=amd64] https://download.docker.com/linux/ubuntu \
   $(lsb_release -cs) \
   stable"
sudo apt-get update
sudo apt-get install -yq docker-ce docker-ce-cli containerd.io
# docker compose
sudo curl -L "https://github.com/docker/compose/releases/download/1.24.0/docker-compose-$(uname -s)-$(uname -m)" -o /usr/local/bin/docker-compose
sudo chmod +x /usr/local/bin/docker-compose
# nvm
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.34.0/install.sh | bash
# yarn
curl -sS https://dl.yarnpkg.com/debian/pubkey.gpg | sudo apt-key add -
echo "deb https://dl.yarnpkg.com/debian/ stable main" | sudo tee /etc/apt/sources.list.d/yarn.list
sudo apt-get update && sudo apt-get install --no-install-recommends -yq yarn
#
sudo apt install redis -yq
#
sudo reboot

# sudo docker run -d -p 6379:6379 --name redis redis:alpine
