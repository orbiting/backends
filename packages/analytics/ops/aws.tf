provider "aws" {
  region     = "eu-west-1"
}

resource "aws_security_group" "allow_ssh" {
  name        = "allow_ssh"

  ingress {
    from_port   = 22
    to_port     = 22
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = {
    Name = "allow_ssh"
  }
}

resource "aws_instance" "analytics" {
  ami           = "ami-08d658f84a6d84a80" # ubuntu 18.04
  instance_type = "z1d.3xlarge"
  key_name      = "analytics"
  security_groups = ["allow_ssh"]

  provisioner "local-exec" {
    command = "echo ${aws_instance.analytics.public_ip} > ip_address.txt"
  }
}
